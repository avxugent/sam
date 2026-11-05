import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    asset: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
      count: vi.fn(),
    },
    assetType: { findMany: vi.fn() },
    manufacturer: { findMany: vi.fn() },
    location: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

import { translateFilters, runAssetReport, ASSET_REPORT_ROW_CAP } from "@/lib/reports/engine";
import { prisma } from "@/lib/prisma";

const mockFindMany = vi.mocked(prisma.asset.findMany);
const mockGroupBy = vi.mocked(prisma.asset.groupBy);
const mockTypeFindMany = vi.mocked(prisma.assetType.findMany);
const mockMfFindMany = vi.mocked(prisma.manufacturer.findMany);
const mockLocFindMany = vi.mocked(prisma.location.findMany);

// ── translateFilters ────────────────────────────────────────────────────────

describe("translateFilters()", () => {
  it("returns empty object for no filters", () => {
    expect(translateFilters([])).toEqual({});
  });

  it("translates typeId eq", () => {
    const result = translateFilters([{ field: "typeId", op: "eq", value: "type-1" }]);
    expect(result).toEqual({ AND: [{ typeId: "type-1" }] });
  });

  it("translates typeId isNull", () => {
    const result = translateFilters([{ field: "typeId", op: "isNull" }]);
    expect(result).toEqual({ AND: [{ typeId: null }] });
  });

  it("translates model contains", () => {
    const result = translateFilters([{ field: "model", op: "contains", value: "Dell" }]);
    expect(result).toEqual({ AND: [{ model: { name: { contains: "Dell" } } }] });
  });

  describe("date filters (clock pinned)", () => {
    const NOW = new Date("2026-01-01T00:00:00Z");
    const DAY = 24 * 60 * 60 * 1000;
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(NOW);
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("olderThanYears is lt now minus N years of 365.25 days", () => {
      const result = translateFilters([{ field: "installationDate", op: "olderThanYears", value: "5" }]);
      expect(result).toEqual({ AND: [{ installationDate: { lt: new Date(NOW.getTime() - 5 * 365.25 * DAY) } }] });
    });

    it("newerThanYears is gt now minus N years, fractions included", () => {
      const result = translateFilters([{ field: "installationDate", op: "newerThanYears", value: "1.5" }]);
      expect(result).toEqual({ AND: [{ installationDate: { gt: new Date(NOW.getTime() - 1.5 * 365.25 * DAY) } }] });
    });

    it("before an ISO date is lt that date", () => {
      const result = translateFilters([{ field: "installationDate", op: "before", value: "2020-01-01" }]);
      expect(result).toEqual({ AND: [{ installationDate: { lt: new Date("2020-01-01") } }] });
    });

    it("after an ISO date is gt that date", () => {
      const result = translateFilters([{ field: "installationDate", op: "after", value: "2022-06-01" }]);
      expect(result).toEqual({ AND: [{ installationDate: { gt: new Date("2022-06-01") } }] });
    });

    it("lastChanged newerThanDays is gt now minus N days, on updatedAt", () => {
      const result = translateFilters([{ field: "lastChanged", op: "newerThanDays", value: "7" }]);
      expect(result).toEqual({ AND: [{ updatedAt: { gt: new Date(NOW.getTime() - 7 * DAY) } }] });
    });

    it("lastChanged olderThanDays is lt now minus N days", () => {
      const result = translateFilters([{ field: "lastChanged", op: "olderThanDays", value: "30" }]);
      expect(result).toEqual({ AND: [{ updatedAt: { lt: new Date(NOW.getTime() - 30 * DAY) } }] });
    });

    it("lastChanged before / after an ISO date bound updatedAt", () => {
      expect(translateFilters([{ field: "lastChanged", op: "before", value: "2024-01-01" }])).toEqual({
        AND: [{ updatedAt: { lt: new Date("2024-01-01") } }],
      });
      expect(translateFilters([{ field: "lastChanged", op: "after", value: "2024-06-01" }])).toEqual({
        AND: [{ updatedAt: { gt: new Date("2024-06-01") } }],
      });
    });
  });

  it("translates installationDate isNull", () => {
    const result = translateFilters([{ field: "installationDate", op: "isNull" }]);
    expect(result).toEqual({ AND: [{ installationDate: null }] });
  });

  it("translates hostname isNotNull", () => {
    const result = translateFilters([{ field: "hostname", op: "isNotNull" }]);
    expect(result).toEqual({ AND: [{ hostname: { not: null } }] });
  });

  it("combines multiple filters with AND", () => {
    const result = translateFilters([
      { field: "typeId", op: "eq", value: "t1" },
      { field: "hostname", op: "isNotNull" },
    ]);
    expect(result).toEqual({
      AND: [{ typeId: "t1" }, { hostname: { not: null } }],
    });
  });

  it("ignores olderThanYears with non-numeric value", () => {
    const result = translateFilters([{ field: "installationDate", op: "olderThanYears", value: "abc" }]);
    expect(result).toEqual({});
  });

  it("ignores lastChanged newerThanDays with non-numeric value", () => {
    const result = translateFilters([{ field: "lastChanged", op: "newerThanDays", value: "abc" }]);
    expect(result).toEqual({});
  });

  it("translates workLogItem hasItem to a some-relation filter", () => {
    const result = translateFilters([{ field: "workLogItem", op: "hasItem", value: "item-1" }]);
    expect(result).toEqual({ AND: [{ workLogs: { some: { itemId: "item-1" } } }] });
  });

  it("translates workLogItem notHasItem to a none-relation filter", () => {
    const result = translateFilters([{ field: "workLogItem", op: "notHasItem", value: "item-1" }]);
    expect(result).toEqual({ AND: [{ workLogs: { none: { itemId: "item-1" } } }] });
  });

  it("ignores workLogItem filter with no value", () => {
    const result = translateFilters([{ field: "workLogItem", op: "hasItem" }]);
    expect(result).toEqual({});
  });

  it("combines a type filter with a workLogItem filter", () => {
    const result = translateFilters([
      { field: "typeId", op: "eq", value: "t1" },
      { field: "workLogItem", op: "notHasItem", value: "item-1" },
    ]);
    expect(result).toEqual({
      AND: [{ typeId: "t1" }, { workLogs: { none: { itemId: "item-1" } } }],
    });
  });

  it("translates locationWorkLogItem hasItem to a location-relation some filter", () => {
    const result = translateFilters([{ field: "locationWorkLogItem", op: "hasItem", value: "item-1" }]);
    expect(result).toEqual({ AND: [{ location: { workLogs: { some: { itemId: "item-1" } } } }] });
  });

  it("translates locationWorkLogItem notHasItem to a location-relation none filter", () => {
    const result = translateFilters([{ field: "locationWorkLogItem", op: "notHasItem", value: "item-1" }]);
    expect(result).toEqual({ AND: [{ location: { workLogs: { none: { itemId: "item-1" } } } }] });
  });

  it("ignores locationWorkLogItem filter with no value", () => {
    const result = translateFilters([{ field: "locationWorkLogItem", op: "hasItem" }]);
    expect(result).toEqual({});
  });

  it("combines a type filter with a locationWorkLogItem filter", () => {
    const result = translateFilters([
      { field: "typeId", op: "eq", value: "t1" },
      { field: "locationWorkLogItem", op: "notHasItem", value: "item-1" },
    ]);
    expect(result).toEqual({
      AND: [{ typeId: "t1" }, { location: { workLogs: { none: { itemId: "item-1" } } } }],
    });
  });

  it("translates status eq INSTALLED", () => {
    const result = translateFilters([{ field: "status", op: "eq", value: "INSTALLED" }]);
    expect(result).toEqual({ AND: [{ status: "INSTALLED" }] });
  });

  it("neq on a nullable field keeps rows where the field is empty", () => {
    expect(translateFilters([{ field: "supplierId", op: "neq", value: "s1" }])).toEqual({
      AND: [{ OR: [{ supplierId: { not: "s1" } }, { supplierId: null }] }],
    });
  });

  it("translates status neq DECOMMISSIONED", () => {
    const result = translateFilters([{ field: "status", op: "neq", value: "DECOMMISSIONED" }]);
    expect(result).toEqual({ AND: [{ status: { not: "DECOMMISSIONED" } }] });
  });

  it("translates status eq IN_REPAIR", () => {
    const result = translateFilters([{ field: "status", op: "eq", value: "IN_REPAIR" }]);
    expect(result).toEqual({ AND: [{ status: "IN_REPAIR" }] });
  });

  it("ignores status filter with an unknown value", () => {
    const result = translateFilters([{ field: "status", op: "eq", value: "BOGUS" }]);
    expect(result).toEqual({});
  });

  it("ignores before/after date filters with an unparseable date", () => {
    expect(translateFilters([{ field: "installationDate", op: "before", value: "not-a-date" }])).toEqual({});
    expect(translateFilters([{ field: "lastChanged", op: "after", value: "2026-13-45" }])).toEqual({});
  });

  it("translates a valid lastChanged before date", () => {
    expect(translateFilters([{ field: "lastChanged", op: "before", value: "2026-01-01" }])).toEqual({
      AND: [{ updatedAt: { lt: new Date("2026-01-01") } }],
    });
  });

  it("ignores status filter with no value", () => {
    const result = translateFilters([{ field: "status", op: "eq" }]);
    expect(result).toEqual({});
  });
});

// ── runReport ───────────────────────────────────────────────────────────────

describe("runReport()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns rows and total with no grouping", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "a1",
        model: { name: "Dell XPS" },
        serialNumber: "SN1",
        hostname: "host1",
        locationId: "loc1",
        installationDate: new Date("2019-01-01"),
        invoiceDate: null,
        invoiceNumber: null,
        notes: null,
        updatedAt: new Date("2024-03-01"),
        type: { name: "Laptop" },
        manufacturer: { name: "Dell" },
        location: { id: "loc1", name: "Room 101" },
      } as never,
    ]);
    mockLocFindMany.mockResolvedValue([{ id: "loc1", name: "Room 101", parentId: null }] as never);

    const result = await runAssetReport({
      source: "asset",
      filters: [],
      groupBy: "none",
      columns: ["model", "type", "location"],
    });

    expect(result.total).toBe(1);
    expect(result.rows[0].model).toBe("Dell XPS");
    expect(result.rows[0].type).toBe("Laptop");
    expect(result.rows[0].location).toBe("Room 101");
    expect(result.groups).toEqual([]);
  });

  it("resolves full location path separated by dash", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "a1",
        model: "HP Elite",
        serialNumber: null,
        hostname: null,
        locationId: "room1",
        installationDate: null,
        invoiceDate: null,
        invoiceNumber: null,
        notes: null,
        type: null,
        manufacturer: null,
        location: { id: "room1", name: "Room A" },
      } as never,
    ]);
    mockLocFindMany.mockResolvedValue([
      { id: "campus1", name: "Campus 14", parentId: null },
      { id: "building1", name: "Building 10", parentId: "campus1" },
      { id: "room1", name: "Room A", parentId: "building1" },
    ] as never);

    const result = await runAssetReport({ source: "asset", filters: [], groupBy: "none", columns: ["location"] });
    expect(result.rows[0].location).toBe("Campus 14 - Building 10 - Room A");
  });

  it("maps a row with all optional fields null (no dates, no catalog)", async () => {
    mockLocFindMany.mockResolvedValue([] as never);
    mockFindMany.mockResolvedValue([
      {
        id: "a0", model: null, serialNumber: null, hostname: null, locationId: "loc0",
        installationDate: null, invoiceDate: null, invoiceNumber: null, notes: null,
        updatedAt: null, type: null, manufacturer: null, location: { name: "Store" },
      } as never,
    ]);
    const result = await runAssetReport({ source: "asset", filters: [], groupBy: "none", columns: ["model", "location"] });
    expect(result.total).toBe(1);
    const r = result.rows[0];
    expect(r.model).toBeNull();
    expect(r.type).toBeNull();
    expect(r.manufacturer).toBeNull();
    expect(r.location).toBe("Store"); // the path lookup missed: the location's own name
    expect(r.installationDate).toBeNull();
    expect(r.invoiceDate).toBeNull();
    expect(r.lastChanged).toBeNull();
  });

  it("falls back to location.name when the path map misses the id", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "a1", model: "M", serialNumber: null, hostname: null, locationId: "lz",
        installationDate: new Date("2021-06-01"), invoiceDate: new Date("2021-07-01"),
        invoiceNumber: "INV", notes: "n", updatedAt: new Date("2024-01-01"),
        type: { name: "T" }, manufacturer: { name: "Mf" }, location: { id: "lz", name: "Fallback Room" },
      } as never,
    ]);
    // path map resolves a DIFFERENT id, so lookup misses → location.name fallback
    mockLocFindMany.mockResolvedValue([{ id: "other", name: "x", parentId: null }] as never);
    const result = await runAssetReport({ source: "asset", filters: [], groupBy: "none", columns: ["location"] });
    expect(result.rows[0].location).toBe("Fallback Room");
    expect(result.rows[0].installationDate).toBe("2021-06-01");
    expect(result.rows[0].invoiceDate).toBe("2021-07-01");
  });

  it("groups by type", async () => {
    mockFindMany.mockResolvedValue([]);
    mockGroupBy.mockResolvedValue([
      { typeId: "t1", _count: { id: 3 } } as never,
      { typeId: null, _count: { id: 1 } } as never,
    ]);
    mockTypeFindMany.mockResolvedValue([{ id: "t1", name: "Projector" }] as never);

    const result = await runAssetReport({
      source: "asset",
      filters: [],
      groupBy: "type",
      columns: ["model"],
    });

    expect(result.groups).toContainEqual({ label: "Projector", count: 3 });
    expect(result.groups).toContainEqual({ label: "No type", count: 1 });
  });

  it("groups by manufacturer", async () => {
    mockFindMany.mockResolvedValue([]);
    mockGroupBy.mockResolvedValue([
      { manufacturerId: "m1", _count: { id: 5 } } as never,
    ]);
    mockMfFindMany.mockResolvedValue([{ id: "m1", name: "Epson" }] as never);

    const result = await runAssetReport({ source: "asset", filters: [], groupBy: "manufacturer", columns: ["model"] });
    expect(result.groups).toContainEqual({ label: "Epson", count: 5 });
  });

  it("groups by location", async () => {
    mockFindMany.mockResolvedValue([]);
    mockGroupBy.mockResolvedValue([
      { locationId: "l1", _count: { id: 2 } } as never,
    ]);
    mockLocFindMany.mockResolvedValue([{ id: "l1", name: "Lab A", parentId: null }] as never);

    const result = await runAssetReport({ source: "asset", filters: [], groupBy: "location", columns: ["model"] });
    expect(result.groups).toContainEqual({ label: "Lab A", count: 2 });
  });

  it("groups by installationYear from asset rows", async () => {
    mockFindMany.mockResolvedValue([
      { id: "a1", model: null, serialNumber: null, hostname: null, locationId: "l1", installationDate: new Date("2020-03-01"), invoiceDate: null, invoiceNumber: null, notes: null, type: null, manufacturer: null, location: { id: "l1", name: "X" } } as never,
      { id: "a2", model: null, serialNumber: null, hostname: null, locationId: "l1", installationDate: new Date("2020-07-01"), invoiceDate: null, invoiceNumber: null, notes: null, type: null, manufacturer: null, location: { id: "l1", name: "X" } } as never,
      { id: "a3", model: null, serialNumber: null, hostname: null, locationId: "l1", installationDate: new Date("2022-01-01"), invoiceDate: null, invoiceNumber: null, notes: null, type: null, manufacturer: null, location: { id: "l1", name: "X" } } as never,
    ]);
    mockLocFindMany.mockResolvedValue([{ id: "l1", name: "X", parentId: null }] as never);

    const result = await runAssetReport({ source: "asset", filters: [], groupBy: "installationYear", columns: ["model"] });
    expect(result.groups).toContainEqual({ label: "2020", count: 2 });
    expect(result.groups).toContainEqual({ label: "2022", count: 1 });
  });

  it("counts the total and year groups over every match when rows hit the cap", async () => {
    const row = (i: number) => ({ id: `a${i}`, model: null, serialNumber: null, hostname: null, locationId: "loc0", installationDate: new Date("2020-03-01"), invoiceDate: null, invoiceNumber: null, notes: null, type: null, manufacturer: null, location: { name: "Store" } });
    mockFindMany
      .mockResolvedValueOnce(Array.from({ length: ASSET_REPORT_ROW_CAP }, (_, i) => row(i)) as never)
      .mockResolvedValueOnce([
        ...Array.from({ length: ASSET_REPORT_ROW_CAP }, () => ({ installationDate: new Date("2020-03-01") })),
        { installationDate: new Date("2023-01-01") },
        { installationDate: null },
      ] as never);
    vi.mocked(prisma.asset.count).mockResolvedValue(ASSET_REPORT_ROW_CAP + 2);
    mockLocFindMany.mockResolvedValue([] as never);

    const result = await runAssetReport({ source: "asset", filters: [], groupBy: "installationYear", columns: ["model"] });
    expect(result.rows).toHaveLength(ASSET_REPORT_ROW_CAP);
    expect(result.total).toBe(ASSET_REPORT_ROW_CAP + 2);
    expect(result.groups).toEqual([
      { label: "2020", count: ASSET_REPORT_ROW_CAP },
      { label: "2023", count: 1 },
      { label: "Unknown", count: 1 },
    ]);
  });

  it("returns every row without a cap when capRows is false", async () => {
    const row = (i: number) => ({ id: `a${i}`, model: null, serialNumber: null, hostname: null, locationId: "loc0", installationDate: null, invoiceDate: null, invoiceNumber: null, notes: null, type: null, manufacturer: null, location: { name: "Store" } });
    mockFindMany.mockResolvedValue(Array.from({ length: ASSET_REPORT_ROW_CAP + 1 }, (_, i) => row(i)) as never);
    mockLocFindMany.mockResolvedValue([] as never);

    const result = await runAssetReport({ source: "asset", filters: [], groupBy: "none", columns: ["model"] }, { capRows: false });
    expect(mockFindMany.mock.calls[0][0]).toMatchObject({ take: undefined });
    expect(result.rows).toHaveLength(ASSET_REPORT_ROW_CAP + 1);
    expect(result.total).toBe(ASSET_REPORT_ROW_CAP + 1);
    expect(prisma.asset.count).not.toHaveBeenCalled();
  });

  it("caps the on-screen run by default", async () => {
    mockFindMany.mockResolvedValue([]);
    await runAssetReport({ source: "asset", filters: [], groupBy: "none", columns: ["model"] });
    expect(mockFindMany.mock.calls[0][0]).toMatchObject({ take: ASSET_REPORT_ROW_CAP });
  });

  it("excludes decommissioned assets by default when no status filter is set", async () => {
    mockFindMany.mockResolvedValue([]);
    await runAssetReport({ source: "asset", filters: [{ field: "typeId", op: "eq", value: "t1" }], groupBy: "none", columns: ["model"] });
    const whereArg = mockFindMany.mock.calls[0][0]?.where as { AND: unknown[] };
    expect(whereArg).toEqual({
      AND: [{ AND: [{ typeId: "t1" }] }, { status: { not: "DECOMMISSIONED" } }],
    });
  });

  it("does not add the implicit decommissioned exclusion when the user already filters on status", async () => {
    mockFindMany.mockResolvedValue([]);
    await runAssetReport({
      source: "asset",
      filters: [{ field: "status", op: "eq", value: "DECOMMISSIONED" }],
      groupBy: "none",
      columns: ["model"],
    });
    const whereArg = mockFindMany.mock.calls[0][0]?.where;
    expect(whereArg).toEqual({ AND: [{ status: "DECOMMISSIONED" }] });
  });

  it.each([
    ["an unknown value", { field: "status", op: "eq", value: "BOGUS" }],
    ["an op other than eq/neq", { field: "status", op: "isNull" }],
  ] as const)("keeps the decommissioned exclusion when the status filter has %s", async (_label, filter) => {
    mockFindMany.mockResolvedValue([]);
    await runAssetReport({ source: "asset", filters: [filter], groupBy: "none", columns: ["model"] });
    const whereArg = mockFindMany.mock.calls[0][0]?.where;
    expect(whereArg).toEqual({ AND: [{}, { status: { not: "DECOMMISSIONED" } }] });
  });

  it("groupBy queries also exclude decommissioned assets by default", async () => {
    mockFindMany.mockResolvedValue([]);
    mockGroupBy.mockResolvedValue([{ typeId: "t1", _count: { id: 2 } } as never]);
    mockTypeFindMany.mockResolvedValue([{ id: "t1", name: "Projector" }] as never);

    await runAssetReport({ source: "asset", filters: [], groupBy: "type", columns: ["model"] });

    const groupByWhere = mockGroupBy.mock.calls[0][0]?.where as { AND: unknown[] };
    expect(groupByWhere).toEqual({ AND: [{}, { status: { not: "DECOMMISSIONED" } }] });
  });
});

describe("translateFilters() — NIS2 fields", () => {
  it("supplierId behaves like the other id fields", () => {
    expect(translateFilters([{ field: "supplierId", op: "eq", value: "s1" }])).toEqual({
      AND: [{ supplierId: "s1" }],
    });
    expect(translateFilters([{ field: "supplierId", op: "isNull" }])).toEqual({
      AND: [{ supplierId: null }],
    });
  });

  it("endOfSupportDate supports the date ops", () => {
    const where = translateFilters([
      { field: "endOfSupportDate", op: "before", value: "2026-01-01" },
    ]) as { AND: Array<Record<string, unknown>> };
    expect(where.AND[0]).toEqual({ endOfSupportDate: { lt: new Date("2026-01-01") } });
    expect(translateFilters([{ field: "endOfSupportDate", op: "isNull" }])).toEqual({
      AND: [{ endOfSupportDate: null }],
    });
  });

  it("criticality eq matches the override OR the inherited type default", () => {
    expect(translateFilters([{ field: "criticality", op: "eq", value: "HIGH" }])).toEqual({
      AND: [
        {
          OR: [
            { criticality: "HIGH" },
            { criticality: null, type: { defaultCriticality: "HIGH" } },
          ],
        },
      ],
    });
  });

  it("criticality isNull selects the unclassified shape; isNotNull negates it", () => {
    const unclassified = {
      criticality: null,
      OR: [{ typeId: null }, { type: { defaultCriticality: null } }],
    };
    expect(translateFilters([{ field: "criticality", op: "isNull" }])).toEqual({
      AND: [unclassified],
    });
    expect(translateFilters([{ field: "criticality", op: "isNotNull" }])).toEqual({
      AND: [{ NOT: unclassified }],
    });
  });

  it("criticality neq negates the effective-level match", () => {
    expect(translateFilters([{ field: "criticality", op: "neq", value: "LOW" }])).toEqual({
      AND: [{ NOT: { OR: [{ criticality: "LOW" }, { criticality: null, type: { defaultCriticality: "LOW" } }] } }],
    });
  });

  it("model filters match the model's name, or the model link for isNull/isNotNull", () => {
    expect(translateFilters([{ field: "model", op: "eq", value: "X1" }])).toEqual({ AND: [{ model: { name: "X1" } }] });
    expect(translateFilters([{ field: "model", op: "neq", value: "X1" }])).toEqual({
      AND: [{ model: { isNot: { name: "X1" } } }],
    });
    expect(translateFilters([{ field: "model", op: "isNull" }])).toEqual({ AND: [{ modelId: null }] });
    expect(translateFilters([{ field: "model", op: "isNotNull" }])).toEqual({ AND: [{ modelId: { not: null } }] });
    expect(translateFilters([{ field: "model", op: "eq" }])).toEqual({});
  });

  it("serialNumber contains is a text match", () => {
    expect(translateFilters([{ field: "serialNumber", op: "contains", value: "AB" }])).toEqual({
      AND: [{ serialNumber: { contains: "AB" } }],
    });
  });

  it("ignores an invalid criticality value (never widens the result set)", () => {
    expect(translateFilters([{ field: "criticality", op: "eq", value: "EXTREME" }])).toEqual({});
    expect(translateFilters([{ field: "criticality", op: "neq", value: "" }])).toEqual({});
  });
});

describe("runAssetReport() — NIS2 columns", () => {
  it("maps supplier name, effective criticality, and end-of-support date", async () => {
    mockLocFindMany.mockResolvedValue([] as never);
    mockFindMany.mockResolvedValue([
      {
        id: "a1",
        model: "M",
        serialNumber: null,
        hostname: null,
        typeId: "t1",
        manufacturerId: null,
        locationId: "loc0",
        installationDate: null,
        invoiceDate: null,
        invoiceNumber: null,
        notes: null,
        updatedAt: new Date("2026-01-01T00:00:00Z"),
        criticality: null,
        endOfSupportDate: new Date("2030-06-30T00:00:00Z"),
        type: { name: "Display", defaultCriticality: "MEDIUM" },
        manufacturer: null,
        supplier: { name: "CampusStore" },
        location: { name: "Store" },
      },
    ] as never);

    const result = await runAssetReport({ source: "asset", filters: [], groupBy: "none", columns: ["model"] });
    expect(result.rows[0].supplier).toBe("CampusStore");
    expect(result.rows[0].criticality).toBe("MEDIUM"); // inherited from type
    expect(result.rows[0].endOfSupportDate).toBe("2030-06-30");
  });
});
