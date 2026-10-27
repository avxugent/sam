import { describe, it, expect } from "vitest";
import { collectSubtreeIds, flattenLocations, type LocationTreeNode } from "@/lib/location-tree";

const tree: LocationTreeNode[] = [
  {
    id: "c",
    name: "Campus",
    parentId: null,
    children: [
      {
        id: "b",
        name: "Building",
        parentId: "c",
        children: [{ id: "r", name: "Room", parentId: "b", _count: { stockItems: 2 } }],
      },
      { id: "b2", name: "Annex", parentId: "c" },
    ],
  },
];

describe("flattenLocations()", () => {
  it("lists every node depth-first with breadcrumbs and stock flags", () => {
    expect(flattenLocations(tree)).toEqual([
      { id: "c", name: "Campus", breadcrumb: "Campus", hasStock: false },
      { id: "b", name: "Building", breadcrumb: "Campus › Building", hasStock: false },
      { id: "r", name: "Room", breadcrumb: "Campus › Building › Room", hasStock: true },
      { id: "b2", name: "Annex", breadcrumb: "Campus › Annex", hasStock: false },
    ]);
  });

  it("prunes whole subtrees and hides single nodes", () => {
    expect(flattenLocations(tree, { prune: new Set(["b"]) }).map((l) => l.id)).toEqual(["c", "b2"]);
    expect(flattenLocations(tree, { hide: new Set(["b"]) }).map((l) => l.id)).toEqual(["c", "r", "b2"]);
  });
});

describe("collectSubtreeIds()", () => {
  it("returns the root and all descendants", () => {
    expect([...collectSubtreeIds(tree, "b")].sort()).toEqual(["b", "r"]);
    expect(collectSubtreeIds(tree, "missing").size).toBe(0);
  });
});
