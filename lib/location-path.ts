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

/**
 * Parses a FI number string (CC.BB.FFF.RRR) into its four segments.
 * Returns null if the format does not match.
 */
export function parseFiNumber(
  fi: string | null | undefined
): { campus: string; building: string; floor: string; room: string } | null {
  if (!fi) return null;
  const match = fi.match(/^(\d{2})\.(\d{2})\.(\d{3})\.(\d{3})$/);
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
export function buildLocationPathString(ancestors: LocationAncestor[]): string {
  return ancestors.map((a) => a.name).join(" / ");
}

/**
 * Finds the most specific (deepest) FI number across the ancestor chain.
 */
export function findFiNumber(ancestors: LocationAncestor[]): string | null {
  // Walk from leaf to root — take the first fiNumber we find
  for (let i = ancestors.length - 1; i >= 0; i--) {
    if (ancestors[i].fiNumber) return ancestors[i].fiNumber;
  }
  return null;
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
    const path: string[] = [];
    let cur: Row | undefined = byId.get(id);
    while (cur) {
      path.unshift(cur.name);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    if (path.length > 0) result.set(id, path.join(separator));
  }
  return result;
}

// CUID format used by Prisma @default(cuid())
const CUID_REGEX = /^[0-9a-z]{25}$/;

/**
 * Returns all descendant location IDs (not including the root itself).
 * Uses a single recursive CTE to avoid N+1 round-trips.
 */
export async function getAllDescendantLocationIds(locationId: string): Promise<string[]> {
  if (!CUID_REGEX.test(locationId)) return [];
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
