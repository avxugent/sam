import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
    location: { findMany: vi.fn() },
  },
}));

import {
  getAllDescendantLocationIds,
  getInstalledUnitTotals,
  getSubtreeIdsDeepestFirst,
  locationBreadcrumbs,
  getLocationAncestors,
  getAncestorChainsBatch,
  locationBreadcrumbsFromRows,
} from "@/lib/locations/path";
import { prisma } from "@/lib/prisma";

const mockQueryRaw = vi.mocked(prisma.$queryRaw);
const mockLocFindMany = vi.mocked(prisma.location.findMany);

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

describe("getLocationAncestors()", () => {
  it("returns ancestors ordered root→leaf from the recursive query", async () => {
    mockQueryRaw.mockResolvedValueOnce([
      { id: "campus", name: "Campus", fiNumber: "14.00.000.000", depth: 2 },
      { id: "bldg", name: "Building", fiNumber: "14.10.000.000", depth: 1 },
      { id: "room", name: "Room", fiNumber: "14.10.100.013", depth: 0 },
    ] as never);
    const result = await getLocationAncestors("room");
    expect(result.map((a) => a.id)).toEqual(["campus", "bldg", "room"]);
    expect(result[2].fiNumber).toBe("14.10.100.013");
  });

  it("returns an empty array when the location has no rows", async () => {
    mockQueryRaw.mockResolvedValueOnce([] as never);
    expect(await getLocationAncestors("missing")).toEqual([]);
  });
});

describe("getAncestorChainsBatch()", () => {
  it("returns empty map for an empty input array", async () => {
    expect(await getAncestorChainsBatch([])).toEqual(new Map());
  });

  it("returns the root→leaf id and name chains, including the location itself", async () => {
    mockLocFindMany.mockResolvedValueOnce([
      { id: "c14", name: "Campus 14", parentId: null },
      { id: "b10", name: "Building 10", parentId: "c14" },
      { id: "room", name: "Room", parentId: "b10" },
    ] as never);
    const result = await getAncestorChainsBatch(["room"]);
    expect(result.get("room")).toEqual({
      ids: ["c14", "b10", "room"],
      names: ["Campus 14", "Building 10", "Room"],
    });
  });

  it("omits ids that aren't found in the location table", async () => {
    mockLocFindMany.mockResolvedValueOnce([{ id: "c14", name: "Campus 14", parentId: null }] as never);
    const result = await getAncestorChainsBatch(["missing"]);
    expect(result.has("missing")).toBe(false);
  });
});

describe("locationBreadcrumbsFromRows()", () => {
  const rows = [
    { id: "c14", name: "Campus 14", parentId: null },
    { id: "b10", name: "Building 10", parentId: "c14" },
    { id: "room", name: "Room", parentId: "b10" },
  ];

  it("builds a ' › ' breadcrumb for every row", () => {
    const result = locationBreadcrumbsFromRows(rows);
    expect(result.get("room")).toBe("Campus 14 › Building 10 › Room");
    expect(result.get("c14")).toBe("Campus 14");
  });

  it("falls back to just the row's own name if its parent isn't in the row set", () => {
    const result = locationBreadcrumbsFromRows([{ id: "orphan", name: "Orphan", parentId: "missing-parent" }]);
    expect(result.get("orphan")).toBe("Orphan");
  });
});

// ── getInstalledUnitTotals ──────────────────────────────────────────────────

describe("getInstalledUnitTotals()", () => {
  it("maps BigInt totals to numbers keyed by location id", async () => {
    mockQueryRaw.mockResolvedValueOnce([
      { id: "root", installedUnits: BigInt(7) },
      { id: "leaf", installedUnits: BigInt(0) },
    ] as never);
    expect(await getInstalledUnitTotals()).toEqual({ root: 7, leaf: 0 });
  });

  it("skips the query for an empty root list", async () => {
    mockQueryRaw.mockClear();
    expect(await getInstalledUnitTotals([])).toEqual({});
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it("scopes the roots when ids are given", async () => {
    mockQueryRaw.mockClear();
    mockQueryRaw.mockResolvedValueOnce([{ id: "root", installedUnits: BigInt(2) }] as never);
    expect(await getInstalledUnitTotals(["root"])).toEqual({ root: 2 });
    expect(JSON.stringify(mockQueryRaw.mock.calls[0])).toContain("root");
  });
});

describe("getSubtreeIdsDeepestFirst()", () => {
  it("returns the ids in the order the query yields them (deepest first)", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ id: "room", depth: 2 }, { id: "bldg", depth: 1 }, { id: "campus", depth: 0 }] as never);
    expect(await getSubtreeIdsDeepestFirst("campus")).toEqual(["room", "bldg", "campus"]);
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
