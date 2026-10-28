import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

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
export async function resolveLocationPath(
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
  return (await resolveLocationPath(locationId)).map(({ id, name }) => ({ id, name }));
}

/**
 * Parses a FI number string (CC.BB.FFF.RR(R)) into its four segments.
 * The last (room) segment may be 2 or 3 digits. Returns null if it doesn't match.
 */
export function parseFiNumber(
  fi: string | null | undefined
): { campus: string; building: string; floor: string; room: string } | null {
  if (!fi) return null;
  const match = fi.match(/^(\d{2})\.(\d{2})\.(\d{3})\.(\d{2,3})$/);
  if (!match) return null;
  return {
    campus: match[1],
    building: match[2],
    floor: match[3],
    room: match[4],
  };
}

/**
 * Builds a human-readable path string from an ancestor array.
 * e.g. "Campus 14 / Building 10 / Floor 100 / Room 013"
 */
export function buildLocationPathString(ancestors: { name: string }[]): string {
  return ancestors.map((a) => a.name).join(" / ");
}

/**
 * Finds the most specific (deepest) FI number across the ancestor chain.
 */
export function findFiNumber(ancestors: { fiNumber: string | null }[]): string | null {
  // Walk from leaf to root — take the first fiNumber we find
  for (let i = ancestors.length - 1; i >= 0; i--) {
    if (ancestors[i].fiNumber) return ancestors[i].fiNumber;
  }
  return null;
}

type TreeRow = { id: string; parentId: string | null };

/**
 * Walks parentId links in an already-loaded location map and returns the
 * chain root → leaf, including the location itself. Empty when `id` is
 * unknown. Stops on a cycle instead of looping forever.
 */
export function ancestorChain<T extends TreeRow>(id: string, byId: Map<string, T>): T[] {
  const chain: T[] = [];
  const seen = new Set<string>();
  let cur = byId.get(id);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return chain;
}

/**
 * Fetches all locations once and resolves full path strings (root → leaf)
 * for each requested ID. Returns a map of locationId → path string.
 * Separator defaults to " - " for display contexts like reports.
 */
export async function resolveLocationPathsBatch(
  locationIds: string[],
  separator = " - "
): Promise<Map<string, string>> {
  if (locationIds.length === 0) return new Map();

  type Row = { id: string; name: string; parentId: string | null };
  const allLocs = await prisma.$queryRaw<Row[]>`SELECT id, name, parentId FROM locations`;

  const byId = new Map<string, Row>(allLocs.map((l) => [l.id, l]));

  const result = new Map<string, string>();
  for (const id of locationIds) {
    const chain = ancestorChain(id, byId);
    if (chain.length > 0) result.set(id, chain.map((l) => l.name).join(separator));
  }
  return result;
}

/**
 * Like resolveLocationPathsBatch, but takes rows the caller already fetched
 * (must include parentId) instead of issuing its own query — for callers
 * that need the full (id, name, parentId) row set for another purpose too,
 * so a second full-table scan isn't worth it just to get paths.
 */
export function buildLocationPathsFromRows(
  rows: { id: string; name: string; parentId: string | null }[],
  separator = " - "
): Map<string, string> {
  const byId = new Map(rows.map((l) => [l.id, l]));

  const result = new Map<string, string>();
  for (const row of rows) {
    result.set(row.id, ancestorChain(row.id, byId).map((l) => l.name).join(separator));
  }
  return result;
}

export type AncestorChain = { ids: string[]; names: string[] };

/**
 * Like resolveLocationPathsBatch, but returns the ordered ancestor *ids* and
 * *names* (root → leaf, each including the location itself) for each
 * requested id in a single pass — one query, one tree walk. Lets callers
 * group by tree level (e.g. campus = [0], building = [1]) and test whether a
 * location falls under a given scope (e.g. a selected campus or building).
 */
export async function resolveAncestorChainsBatch(
  locationIds: string[]
): Promise<Map<string, AncestorChain>> {
  if (locationIds.length === 0) return new Map();

  type Row = { id: string; name: string; parentId: string | null };
  const allLocs = await prisma.$queryRaw<Row[]>`SELECT id, name, parentId FROM locations`;
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
