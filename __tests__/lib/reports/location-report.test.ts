import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workLogItem: { findMany: vi.fn() },
    location: { findMany: vi.fn() },
    workLog: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));
// The report reads campus/building through this helper; its own tree query is
// covered by the path tests, so it is stubbed with the fixture tree.
vi.mock("@/lib/locations/path", () => ({ getAncestorChainsBatch: vi.fn(), getLocationPathsBatch: vi.fn() }));

import { runLocationReport } from "@/lib/reports/engine";
import { prisma } from "@/lib/prisma";
import { getAncestorChainsBatch } from "@/lib/locations/path";
import { ancestorChain } from "@/lib/locations/tree";

const mockItemFindMany = vi.mocked(prisma.workLogItem.findMany);
const mockLocFindMany = vi.mocked(prisma.location.findMany);
const mockLogFindMany = vi.mocked(prisma.workLog.findMany);

/** Ancestor chains come from `tree`; the report's own location.findMany returns `rooms`. */
function locationRows(tree: { id: string; name: string; parentId: string | null }[], rooms: unknown[]) {
  const byId = new Map(tree.map((l) => [l.id, l]));
  vi.mocked(getAncestorChainsBatch).mockImplementation(async (ids) => {
    const chains = ids.map((id) => ancestorChain(id, byId)).filter((chain) => chain.length > 0);
    return new Map(chains.map((chain) => [chain[chain.length - 1].id, { ids: chain.map((l) => l.id), names: chain.map((l) => l.name) }]));
  });
  mockLocFindMany.mockResolvedValue(rooms as never);
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockItemFindMany.mockResolvedValue([{ id: "wi1", name: "Review asset list" }] as never);
  // Tree behind getAncestorChainsBatch (campus → building → rooms), and the report's own room list.
  locationRows(
    [
      { id: "c14", name: "Campus 14", parentId: null },
      { id: "b10", name: "Building 10", parentId: "c14" },
      { id: "loc1", name: "Room 1", parentId: "b10" },
      { id: "loc2", name: "Room 2", parentId: "b10" },
    ],
    [
      { id: "loc1", name: "Room 1", fiNumber: "14.10.100.001" },
      { id: "loc2", name: "Room 2", fiNumber: null },
    ]
  );
  // loc1 reviewed recently; loc2 never.
  mockLogFindMany.mockResolvedValue([
    { locationId: "loc1", itemId: "wi1", performedAt: daysAgo(30), performedBy: { name: "Alice" } },
  ] as never);
});

describe("runLocationReport()", () => {
  it("marks leaf locations filled / not filled per item", async () => {
    const result = await runLocationReport({ source: "location", itemIds: ["wi1"], status: "all" });
    expect(result.source).toBe("location");
    expect(result.itemColumns).toEqual([{ id: "wi1", name: "Review asset list" }]);
    expect(result.total).toBe(2);

    const loc1 = result.rows.find((r) => r.id === "loc1")!;
    const loc2 = result.rows.find((r) => r.id === "loc2")!;
    expect(loc1.items["wi1"].filled).toBe(true);
    expect(loc1.items["wi1"].performedBy).toBe("Alice");
    expect(loc2.items["wi1"].filled).toBe(false);

    expect(result.filledCount).toBe(1);
    expect(result.notFilledCount).toBe(1);
  });

  it("derives campus / building and sorts by campus, building, room", async () => {
    const result = await runLocationReport({ source: "location", itemIds: ["wi1"], status: "all" });
    expect(result.rows[0].campus).toBe("Campus 14");
    expect(result.rows[0].building).toBe("Building 10");
    expect(result.rows.map((r) => r.name)).toEqual(["Room 1", "Room 2"]);
  });

  it("filters to only filled / not-filled locations", async () => {
    const filled = await runLocationReport({ source: "location", itemIds: ["wi1"], status: "filled" });
    expect(filled.rows.map((r) => r.id)).toEqual(["loc1"]);
    const not = await runLocationReport({ source: "location", itemIds: ["wi1"], status: "notFilled" });
    expect(not.rows.map((r) => r.id)).toEqual(["loc2"]);
  });

  it("treats a stale entry as not filled when a time window is set", async () => {
    // loc1's only entry is ~2 years old.
    mockLogFindMany.mockResolvedValue([
      { locationId: "loc1", itemId: "wi1", performedAt: daysAgo(800), performedBy: { name: "Alice" } },
    ] as never);
    const result = await runLocationReport({
      source: "location",
      itemIds: ["wi1"],
      status: "notFilled",
      periodCount: 1,
      periodUnit: "years",
    });
    // Both rows: loc1 (overdue) + loc2 (never).
    expect(result.rows.map((r) => r.id).sort()).toEqual(["loc1", "loc2"]);
    const loc1 = result.rows.find((r) => r.id === "loc1")!;
    expect(loc1.items["wi1"].filled).toBe(false);
    // The old date is still surfaced so the user sees when it was last done.
    expect(loc1.items["wi1"].date).not.toBeNull();
  });

  it("keeps a recent entry filled within the window", async () => {
    const result = await runLocationReport({
      source: "location",
      itemIds: ["wi1"],
      status: "filled",
      periodCount: 1,
      periodUnit: "years",
    });
    expect(result.rows.map((r) => r.id)).toEqual(["loc1"]);
  });

  it("drops itemIds that no longer exist", async () => {
    mockItemFindMany.mockResolvedValue([] as never);
    const result = await runLocationReport({ source: "location", itemIds: ["gone"], status: "all" });
    expect(result.itemColumns).toEqual([]);
    expect(result.filledCount).toBe(0);
  });

  it("restricts rows to leaves under a selected room-level scope id", async () => {
    const result = await runLocationReport({
      source: "location",
      itemIds: ["wi1"],
      status: "all",
      locationIds: ["loc1"],
    });
    expect(result.rows.map((r) => r.id)).toEqual(["loc1"]);
    expect(result.total).toBe(1);
  });

  it("includes every leaf under a selected building-level scope id", async () => {
    const result = await runLocationReport({
      source: "location",
      itemIds: ["wi1"],
      status: "all",
      locationIds: ["b10"],
    });
    expect(result.rows.map((r) => r.id).sort()).toEqual(["loc1", "loc2"]);
  });

  it("returns no rows when the scope id matches no location", async () => {
    const result = await runLocationReport({
      source: "location",
      itemIds: ["wi1"],
      status: "all",
      locationIds: ["nonexistent"],
    });
    expect(result.rows).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("ignores an empty locationIds array (no scoping)", async () => {
    const result = await runLocationReport({
      source: "location",
      itemIds: ["wi1"],
      status: "all",
      locationIds: [],
    });
    expect(result.total).toBe(2);
  });
});
