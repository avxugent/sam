/**
 * Helpers for nested location trees: nesting a flat location list (server
 * pages), and flattening the tree returned by GET /api/locations for the
 * location pickers in the move/deploy/relocate dialogs.
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
