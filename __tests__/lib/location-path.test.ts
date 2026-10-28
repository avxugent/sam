import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

import {
  parseFiNumber,
  buildLocationPathString,
  findFiNumber,
  getAllDescendantLocationIds,
  getRecursiveAssetCounts,
  getSubtreeIdsDeepestFirst,
  ancestorChain,
  locationBreadcrumbs,
  resolveLocationPath,
  resolveAncestorChainsBatch,
  buildLocationPathsFromRows,
  type LocationAncestor,
} from "@/lib/location-path";
import { prisma } from "@/lib/prisma";

const mockQueryRaw = vi.mocked(prisma.$queryRaw);

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

// ── getAllDescendantLocationIds ────────────────────────────────────────────────

describe("getAllDescendantLocationIds()", () => {
  it("queries ids of any shape instead of short-circuiting (the move-cycle guard relies on it)", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ id: "child-1" }] as never);
    await expect(getAllDescendantLocationIds("seed-location-1")).resolves.toEqual(["child-1"]);
  });

  it("returns descendant ids from the database", async () => {
    const validId = "a".repeat(25);
    mockQueryRaw.mockResolvedValueOnce([{ id: "b".repeat(25) }, { id: "c".repeat(25) }] as never);
    const result = await getAllDescendantLocationIds(validId);
    expect(result).toEqual(["b".repeat(25), "c".repeat(25)]);
  });

  it("returns empty array when no descendants exist", async () => {
    const validId = "a".repeat(25);
    mockQueryRaw.mockResolvedValueOnce([] as never);
    const result = await getAllDescendantLocationIds(validId);
    expect(result).toEqual([]);
  });
});

describe("resolveLocationPath()", () => {
  it("returns ancestors ordered root→leaf from the recursive query", async () => {
    mockQueryRaw.mockResolvedValueOnce([
      { id: "campus", name: "Campus", fiNumber: "14.00.000.000", depth: 2 },
      { id: "bldg", name: "Building", fiNumber: "14.10.000.000", depth: 1 },
      { id: "room", name: "Room", fiNumber: "14.10.100.013", depth: 0 },
    ] as never);
    const result = await resolveLocationPath("room");
    expect(result.map((a) => a.id)).toEqual(["campus", "bldg", "room"]);
    expect(result[2].fiNumber).toBe("14.10.100.013");
  });

  it("returns an empty array when the location has no rows", async () => {
    mockQueryRaw.mockResolvedValueOnce([] as never);
    expect(await resolveLocationPath("missing")).toEqual([]);
  });
});

describe("resolveAncestorChainsBatch()", () => {
  it("returns empty map for an empty input array", async () => {
    expect(await resolveAncestorChainsBatch([])).toEqual(new Map());
  });

  it("returns the root→leaf id and name chains, including the location itself", async () => {
    mockQueryRaw.mockResolvedValueOnce([
      { id: "c14", name: "Campus 14", parentId: null },
      { id: "b10", name: "Building 10", parentId: "c14" },
      { id: "room", name: "Room", parentId: "b10" },
    ] as never);
    const result = await resolveAncestorChainsBatch(["room"]);
    expect(result.get("room")).toEqual({
      ids: ["c14", "b10", "room"],
      names: ["Campus 14", "Building 10", "Room"],
    });
  });

  it("omits ids that aren't found in the location table", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ id: "c14", name: "Campus 14", parentId: null }] as never);
    const result = await resolveAncestorChainsBatch(["missing"]);
    expect(result.has("missing")).toBe(false);
  });
});

describe("buildLocationPathsFromRows()", () => {
  const rows = [
    { id: "c14", name: "Campus 14", parentId: null },
    { id: "b10", name: "Building 10", parentId: "c14" },
    { id: "room", name: "Room", parentId: "b10" },
  ];

  it("builds a path string for every row", () => {
    const result = buildLocationPathsFromRows(rows, " › ");
    expect(result.get("room")).toBe("Campus 14 › Building 10 › Room");
    expect(result.get("c14")).toBe("Campus 14");
  });

  it("defaults to ' - ' as the separator", () => {
    const result = buildLocationPathsFromRows(rows);
    expect(result.get("room")).toBe("Campus 14 - Building 10 - Room");
  });

  it("falls back to just the row's own name if its parent isn't in the row set", () => {
    const result = buildLocationPathsFromRows([{ id: "orphan", name: "Orphan", parentId: "missing-parent" }]);
    expect(result.get("orphan")).toBe("Orphan");
  });
});

// ── getRecursiveAssetCounts ──────────────────────────────────────────────────

describe("getRecursiveAssetCounts()", () => {
  it("maps BigInt totals to numbers keyed by location id", async () => {
    mockQueryRaw.mockResolvedValueOnce([
      { id: "root", totalAssets: BigInt(7) },
      { id: "leaf", totalAssets: BigInt(0) },
    ] as never);
    expect(await getRecursiveAssetCounts()).toEqual({ root: 7, leaf: 0 });
  });

  it("skips the query for an empty root list", async () => {
    mockQueryRaw.mockClear();
    expect(await getRecursiveAssetCounts([])).toEqual({});
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it("scopes the roots when ids are given", async () => {
    mockQueryRaw.mockClear();
    mockQueryRaw.mockResolvedValueOnce([{ id: "root", totalAssets: BigInt(2) }] as never);
    expect(await getRecursiveAssetCounts(["root"])).toEqual({ root: 2 });
    expect(JSON.stringify(mockQueryRaw.mock.calls[0])).toContain("root");
  });
});

describe("getSubtreeIdsDeepestFirst()", () => {
  it("returns the ids in the order the query yields them (deepest first)", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ id: "room", depth: 2 }, { id: "bldg", depth: 1 }, { id: "campus", depth: 0 }] as never);
    expect(await getSubtreeIdsDeepestFirst("campus")).toEqual(["room", "bldg", "campus"]);
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

describe("locationBreadcrumbs()", () => {
  it("returns id/name pairs root → leaf from the ancestor query", async () => {
    mockQueryRaw.mockResolvedValueOnce([
      { id: "c", name: "Campus", fiNumber: null, depth: 1 },
      { id: "r", name: "Room", fiNumber: "14.10.100.013", depth: 0 },
    ] as never);
    expect(await locationBreadcrumbs("r")).toEqual([
      { id: "c", name: "Campus" },
      { id: "r", name: "Room" },
    ]);
  });
});
