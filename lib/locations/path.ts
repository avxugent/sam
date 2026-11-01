import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ancestorChain } from "@/lib/locations/tree";

export type LocationAncestor = {
  id: string;
  name: string;
  fiNumber: string | null;
};

/**
 * Resolves the full ancestor chain for a location (root → leaf).
 * Uses a single recursive CTE to avoid N+1 round-trips.
 *
 * Returns an array ordered from root (campus) to the location itself.
 */
export async function getLocationAncestors(
  locationId: string
): Promise<LocationAncestor[]> {
  type Row = { id: string; name: string; fiNumber: string | null; depth: number };

  const rows = await prisma.$queryRaw<Row[]>`
    WITH RECURSIVE ancestors AS (
      SELECT id, name, fiNumber, parentId, 0 AS depth
      FROM locations
      WHERE id = ${locationId}
      UNION ALL
      SELECT l.id, l.name, l.fiNumber, l.parentId, a.depth + 1
      FROM locations l
      INNER JOIN ancestors a ON l.id = a.parentId
    )
    SELECT id, name, fiNumber, depth
    FROM ancestors
    ORDER BY depth DESC
  `;

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    fiNumber: r.fiNumber,
  }));
}

/** Root → leaf `{ id, name }` crumbs for a location page header. */
export async function locationBreadcrumbs(locationId: string): Promise<{ id: string; name: string }[]> {
  return (await getLocationAncestors(locationId)).map(({ id, name }) => ({ id, name }));
}

/**
 * Fetches all locations once and resolves full path strings (root → leaf)
 * for each requested ID. Returns a map of locationId → path string.
 * Joined with " - ", the separator of report, compliance and CSV output.
 * Ids that name no location are left out of the map.
 */
export async function getLocationPathsBatch(
  locationIds: string[]
): Promise<Map<string, string>> {
  if (locationIds.length === 0) return new Map();

  type Row = { id: string; name: string; parentId: string | null };
  const allLocs: Row[] = await prisma.location.findMany({ select: { id: true, name: true, parentId: true } });

  const byId = new Map<string, Row>(allLocs.map((l) => [l.id, l]));

  const result = new Map<string, string>();
  for (const id of locationIds) {
    const chain = ancestorChain(id, byId);
    if (chain.length > 0) result.set(id, chain.map((l) => l.name).join(" - "));
  }
  return result;
}

/**
 * Like getLocationPathsBatch, but takes rows the caller already fetched
 * (must include parentId) instead of issuing its own query — for callers
 * that need the full (id, name, parentId) row set for another purpose too,
 * so a second full-table scan isn't worth it just to get paths. Joined with
 * " › ", the breadcrumb separator of the UI pickers that use it.
 */
export function buildLocationPathsFromRows(
  rows: { id: string; name: string; parentId: string | null }[]
): Map<string, string> {
  const byId = new Map(rows.map((l) => [l.id, l]));

  const result = new Map<string, string>();
  for (const row of rows) {
    result.set(row.id, ancestorChain(row.id, byId).map((l) => l.name).join(" › "));
  }
  return result;
}

export type AncestorChain = { ids: string[]; names: string[] };

/**
 * Like getLocationPathsBatch, but returns the ordered ancestor *ids* and
 * *names* (root → leaf, each including the location itself) for each
 * requested id in a single pass — one query, one tree walk. Lets callers
 * group by tree level (e.g. campus = [0], building = [1]) and test whether a
 * location falls under a given scope (e.g. a selected campus or building).
 */
export async function getAncestorChainsBatch(
  locationIds: string[]
): Promise<Map<string, AncestorChain>> {
  if (locationIds.length === 0) return new Map();

  type Row = { id: string; name: string; parentId: string | null };
  const allLocs: Row[] = await prisma.location.findMany({ select: { id: true, name: true, parentId: true } });
  const byId = new Map<string, Row>(allLocs.map((l) => [l.id, l]));

  const result = new Map<string, AncestorChain>();
  for (const id of locationIds) {
    const chain = ancestorChain(id, byId);
    if (chain.length > 0) result.set(id, { ids: chain.map((l) => l.id), names: chain.map((l) => l.name) });
  }
  return result;
}

/**
 * Returns all descendant location IDs (not including the root itself); an
 * unknown id has none. Uses a single recursive CTE to avoid N+1 round-trips.
 */
export async function getAllDescendantLocationIds(locationId: string): Promise<string[]> {
  type Row = { id: string };
  const rows = await prisma.$queryRaw<Row[]>`
    WITH RECURSIVE loc_tree AS (
      SELECT id FROM locations WHERE id = ${locationId}
      UNION ALL
      SELECT l.id FROM locations l
      INNER JOIN loc_tree lt ON l.parentId = lt.id
    )
    SELECT id FROM loc_tree WHERE id != ${locationId}
  `;
  return rows.map((r) => r.id);
}

/**
 * Installed-asset quantity per location, summed over the location and all of
 * its descendants. Without `rootIds` every location is a root; with them only
 * those locations are counted (search results). One recursive CTE either way.
 */
export async function getRecursiveAssetCounts(rootIds?: string[]): Promise<Record<string, number>> {
  if (rootIds?.length === 0) return {};
  const roots = rootIds ? Prisma.sql`WHERE id IN (${Prisma.join(rootIds)})` : Prisma.empty;
  const rows = await prisma.$queryRaw<{ id: string; totalAssets: bigint }[]>`
    WITH RECURSIVE loc_tree AS (
      SELECT id AS root_id, id AS loc_id FROM locations ${roots}
      UNION ALL
      SELECT lt.root_id, l.id AS loc_id
      FROM loc_tree lt
      INNER JOIN locations l ON l.parentId = lt.loc_id
    )
    SELECT lt.root_id AS id, COALESCE(SUM(a.quantity), 0) AS totalAssets
    FROM loc_tree lt
    LEFT JOIN assets a ON a.locationId = lt.loc_id AND a.status = 'INSTALLED'
    GROUP BY lt.root_id
  `;
  const map: Record<string, number> = {};
  for (const row of rows) map[row.id] = Number(row.totalAssets);
  return map;
}

/**
 * The location and all of its descendants, deepest first: the order they must
 * be deleted in, since Location -> parent is onDelete: Restrict.
 */
export async function getSubtreeIdsDeepestFirst(locationId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string; depth: number }[]>`
    WITH RECURSIVE loc_tree AS (
      SELECT id, 0 AS depth FROM locations WHERE id = ${locationId}
      UNION ALL
      SELECT l.id, lt.depth + 1 FROM locations l
      INNER JOIN loc_tree lt ON l.parentId = lt.id
    )
    SELECT id, depth FROM loc_tree ORDER BY depth DESC
  `;
  return rows.map((r) => r.id);
}
