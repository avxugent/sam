import { FI_NUMBER_REGEX } from "@/lib/schemas/location";

/**
 * Helpers for nested location trees: nesting a flat location list (server
 * pages), flattening the tree returned by GET /api/locations for the
 * location pickers in the move/deploy/relocate dialogs, the name filter
 * of the sidebar and the location browser, and the in-memory ancestor
 * chain with the FI-number and path rules read from it. No DB code.
 */

export type LocationTreeNode = {
  id: string;
  name: string;
  parentId: string | null;
  children?: LocationTreeNode[];
  _count?: { stockItems: number };
};

export type FlatLocation = {
  id: string;
  name: string;
  /** "Campus › Building › Room" */
  breadcrumb: string;
  hasStock: boolean;
};

type FlattenOptions = {
  /** Skip these nodes and their whole subtree. */
  prune?: Set<string>;
  /** Skip these nodes but keep their descendants. */
  hide?: Set<string>;
};

export type Nested<T> = T & { children: Nested<T>[] };

/**
 * Nests a flat location list into a tree of any depth. Siblings keep the order
 * of `rows`; a row whose parent is not in `rows` becomes a root.
 */
export function nestLocations<T extends { id: string; parentId: string | null }>(rows: T[]): Nested<T>[] {
  const nodes = new Map<string, Nested<T>>(rows.map((row) => [row.id, { ...row, children: [] }]));
  const roots: Nested<T>[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  return roots;
}

/** Depth-first list of every location with its breadcrumb path. */
export function flattenLocations(
  nodes: LocationTreeNode[],
  options: FlattenOptions = {},
  ancestors: string[] = []
): FlatLocation[] {
  const result: FlatLocation[] = [];
  for (const node of nodes) {
    if (options.prune?.has(node.id)) continue;
    const path = [...ancestors, node.name];
    if (!options.hide?.has(node.id)) {
      result.push({
        id: node.id,
        name: node.name,
        breadcrumb: path.join(" › "),
        hasStock: (node._count?.stockItems ?? 0) > 0,
      });
    }
    if (node.children?.length) result.push(...flattenLocations(node.children, options, path));
  }
  return result;
}

/** `rootId` plus the ids of all of its descendants. */
export function collectSubtreeIds(nodes: LocationTreeNode[], rootId: string): Set<string> {
  const ids = new Set<string>();
  const walk = (node: LocationTreeNode, inSubtree: boolean) => {
    const within = inSubtree || node.id === rootId;
    if (within) ids.add(node.id);
    node.children?.forEach((c) => walk(c, within));
  };
  nodes.forEach((n) => walk(n, false));
  return ids;
}

type IdTree = { id: string; children: IdTree[] };

/** Whether `id` is `node` itself or one of its descendants. */
export function subtreeContains(node: IdTree, id: string): boolean {
  return node.id === id || node.children.some((c) => subtreeContains(c, id));
}

type NamedTree = { name: string; children: NamedTree[] };

/** Whether `node` or any descendant has `query` (lower-cased) in its name. */
export function subtreeMatchesFilter(node: NamedTree, query: string): boolean {
  return node.name.toLowerCase().includes(query) || node.children.some((c) => subtreeMatchesFilter(c, query));
}

/** How a tree row shows under a name filter. */
export type TreeFilterState = {
  /** Shown at all: no filter, inside a match, a match, or leading to one. */
  visible: boolean;
  /** Its own name matches (rendered highlighted). */
  matches: boolean;
  /** Kept open because a match is at or below it. */
  forceOpen: boolean;
  /** Pass to the children: they are inside a match, so all of them show. */
  childrenInsideMatch: boolean;
};

/**
 * The name filter shared by the sidebar and the location browser: a node
 * shows when its name matches or a descendant's does, and everything below
 * a matching node stays visible. `query` is lower-cased and trimmed.
 */
export function treeFilterState(node: NamedTree, query: string, insideMatch = false): TreeFilterState {
  if (!query || insideMatch) return { visible: true, matches: false, forceOpen: false, childrenInsideMatch: insideMatch };
  const matches = node.name.toLowerCase().includes(query);
  const leadsToMatch = !matches && node.children.some((c) => subtreeMatchesFilter(c, query));
  return { visible: matches || leadsToMatch, matches, forceOpen: matches || leadsToMatch, childrenInsideMatch: matches };
}

/**
 * Parses a FI number string (CC.BB.FFF.RR(R)) into its four segments.
 * The last (room) segment may be 2 or 3 digits. Returns null if it doesn't match.
 */
export function parseFiNumber(
  fi: string | null | undefined
): { campus: string; building: string; floor: string; room: string } | null {
  if (!fi || !FI_NUMBER_REGEX.test(fi)) return null;
  const [campus, building, floor, room] = fi.split(".");
  return { campus, building, floor, room };
}

/**
 * The " / "-joined path of an ancestor array, as the Prometheus
 * sam_location_path label and the Grafana by-hostname lookup carry it,
 * e.g. "Campus 14 / Building 10 / Floor 100 / Room 013".
 */
export function locationLabelPath(ancestors: { name: string }[]): string {
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
