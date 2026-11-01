import { describe, it, expect } from "vitest";
import {
  ancestorChain,
  buildLocationPathString,
  collectSubtreeIds,
  findFiNumber,
  flattenLocations,
  nestLocations,
  parseFiNumber,
  subtreeMatchesFilter,
  treeFilterState,
  type LocationTreeNode,
} from "@/lib/locations/tree";
import type { LocationAncestor } from "@/lib/locations/path";

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

describe("nestLocations()", () => {
  it("nests a tree of any depth, keeping sibling order", () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ id: `l${i}`, parentId: i === 0 ? null : `l${i - 1}` }));
    rows.push({ id: "b", parentId: "l0" }, { id: "a", parentId: "l0" });
    const [root] = nestLocations(rows);

    expect(root.children.map((c) => c.id)).toEqual(["l1", "b", "a"]);
    let node = root;
    for (let depth = 1; depth < 8; depth++) node = node.children[0];
    expect(node.id).toBe("l7");
    expect(node.children).toEqual([]);
  });

  it("treats a row whose parent is missing as a root", () => {
    expect(nestLocations([{ id: "x", parentId: "gone" }]).map((n) => n.id)).toEqual(["x"]);
  });
});

describe("treeFilterState()", () => {
  const room = { name: "Room 1.01", children: [] };
  const building = { name: "Building A", children: [room, { name: "Lab", children: [] }] };
  const campus = { name: "Campus Ghent", children: [building] };

  it("shows everything without a query", () => {
    expect(treeFilterState(campus, "")).toEqual({ visible: true, matches: false, forceOpen: false, childrenInsideMatch: false });
  });

  it("opens the path to a match and hides unrelated branches", () => {
    expect(treeFilterState(campus, "room")).toMatchObject({ visible: true, matches: false, forceOpen: true });
    expect(treeFilterState(building, "room")).toMatchObject({ visible: true, forceOpen: true });
    expect(treeFilterState(room, "room")).toMatchObject({ visible: true, matches: true });
    expect(treeFilterState({ name: "Lab", children: [] }, "room").visible).toBe(false);
  });

  it("keeps the whole subtree of a match visible", () => {
    const state = treeFilterState(building, "building");
    expect(state).toMatchObject({ matches: true, childrenInsideMatch: true });
    expect(treeFilterState({ name: "Lab", children: [] }, "building", state.childrenInsideMatch).visible).toBe(true);
  });

  it("subtreeMatchesFilter looks at descendants", () => {
    expect(subtreeMatchesFilter(campus, "lab")).toBe(true);
    expect(subtreeMatchesFilter(campus, "nowhere")).toBe(false);
  });
});

// ── parseFiNumber ───────────────────────────────────────────────────────────

describe("parseFiNumber()", () => {
  it("parses a valid FI number", () => {
    const result = parseFiNumber("14.10.100.013");
    expect(result).toEqual({
      campus: "14",
      building: "10",
      floor: "100",
      room: "013",
    });
  });

  it("parses leading-zero numbers correctly", () => {
    const result = parseFiNumber("01.02.003.004");
    expect(result).toEqual({
      campus: "01",
      building: "02",
      floor: "003",
      room: "004",
    });
  });

  it("accepts a 2-digit room segment", () => {
    expect(parseFiNumber("14.10.100.13")).toEqual({
      campus: "14",
      building: "10",
      floor: "100",
      room: "13",
    });
  });

  it("returns null for null input", () => {
    expect(parseFiNumber(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(parseFiNumber(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseFiNumber("")).toBeNull();
  });

  it("returns null for wrong segment count", () => {
    expect(parseFiNumber("14.10.100")).toBeNull();
    expect(parseFiNumber("14.10.100.013.999")).toBeNull();
  });

  it("returns null for wrong digit counts", () => {
    expect(parseFiNumber("1.10.100.013")).toBeNull();   // CC must be 2 digits
    expect(parseFiNumber("14.1.100.013")).toBeNull();   // BB must be 2 digits
    expect(parseFiNumber("14.10.10.013")).toBeNull();   // FFF must be 3 digits
    expect(parseFiNumber("14.10.100.1")).toBeNull();    // room must be 2-3 digits
    expect(parseFiNumber("14.10.100.0134")).toBeNull(); // room max 3 digits
  });

  it("returns null for non-numeric segments", () => {
    expect(parseFiNumber("AB.10.100.013")).toBeNull();
  });
});

// ── buildLocationPathString ─────────────────────────────────────────────────

describe("buildLocationPathString()", () => {
  const ancestors: LocationAncestor[] = [
    { id: "1", name: "Campus A",   fiNumber: null },
    { id: "2", name: "Building 10", fiNumber: null },
    { id: "3", name: "Floor 1",    fiNumber: null },
    { id: "4", name: "Room 013",   fiNumber: "14.10.100.013" },
  ];

  it("joins ancestor names with ' / '", () => {
    expect(buildLocationPathString(ancestors)).toBe(
      "Campus A / Building 10 / Floor 1 / Room 013"
    );
  });

  it("returns the single name for a single ancestor", () => {
    expect(buildLocationPathString([{ id: "x", name: "Only", fiNumber: null }])).toBe("Only");
  });

  it("returns empty string for no ancestors", () => {
    expect(buildLocationPathString([])).toBe("");
  });
});

// ── findFiNumber ─────────────────────────────────────────────────────────────

describe("findFiNumber()", () => {
  it("returns the leaf-level fiNumber", () => {
    const ancestors: LocationAncestor[] = [
      { id: "1", name: "Campus",   fiNumber: null },
      { id: "2", name: "Building", fiNumber: null },
      { id: "3", name: "Room",     fiNumber: "14.10.100.013" },
    ];
    expect(findFiNumber(ancestors)).toBe("14.10.100.013");
  });

  it("returns the deepest fiNumber when multiple levels have one", () => {
    const ancestors: LocationAncestor[] = [
      { id: "1", name: "Campus",   fiNumber: "14.00.000.000" },
      { id: "2", name: "Room",     fiNumber: "14.10.100.013" },
    ];
    expect(findFiNumber(ancestors)).toBe("14.10.100.013");
  });

  it("returns null when no ancestor has a fiNumber", () => {
    const ancestors: LocationAncestor[] = [
      { id: "1", name: "Campus", fiNumber: null },
      { id: "2", name: "Room",   fiNumber: null },
    ];
    expect(findFiNumber(ancestors)).toBeNull();
  });

  it("returns null for empty ancestor array", () => {
    expect(findFiNumber([])).toBeNull();
  });
});

// ── ancestorChain ────────────────────────────────────────────────────────────

describe("ancestorChain()", () => {
  const rows = [
    { id: "campus", parentId: null },
    { id: "building", parentId: "campus" },
    { id: "room", parentId: "building" },
  ];
  const byId = new Map(rows.map((r) => [r.id, r]));

  it("returns root → leaf including the location itself", () => {
    expect(ancestorChain("room", byId).map((r) => r.id)).toEqual(["campus", "building", "room"]);
  });

  it("is empty for an unknown id", () => {
    expect(ancestorChain("nope", byId)).toEqual([]);
  });

  it("stops on a parentId cycle", () => {
    const cyclic = new Map([
      ["a", { id: "a", parentId: "b" }],
      ["b", { id: "b", parentId: "a" }],
    ]);
    expect(ancestorChain("a", cyclic).map((r) => r.id)).toEqual(["b", "a"]);
  });
});
