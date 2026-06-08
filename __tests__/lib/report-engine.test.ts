import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    asset: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    assetType: { findMany: vi.fn() },
    manufacturer: { findMany: vi.fn() },
    location: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

import { translateFilters, runAssetReport } from "@/lib/report-engine";
import { prisma } from "@/lib/prisma";

const mockFindMany = vi.mocked(prisma.asset.findMany);
const mockGroupBy = vi.mocked(prisma.asset.groupBy);
const mockTypeFindMany = vi.mocked(prisma.assetType.findMany);
const mockMfFindMany = vi.mocked(prisma.manufacturer.findMany);
const mockLocFindMany = vi.mocked(prisma.location.findMany);
const mockQueryRaw = vi.mocked(prisma.$queryRaw);

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
    expect(result).toEqual({ AND: [{ model: { contains: "Dell" } }] });
  });

  it("translates installationDate olderThanYears", () => {
    const before = new Date();
    const result = translateFilters([{ field: "installationDate", op: "olderThanYears", value: "5" }]);
    expect(result).toHaveProperty("AND");
    const condition = (result as { AND: { installationDate?: { lt: Date } }[] }).AND[0];
    expect(condition.installationDate?.lt).toBeInstanceOf(Date);
    expect(condition.installationDate!.lt.getTime()).toBeLessThanOrEqual(before.getTime());
  });

  it("translates installationDate newerThanYears", () => {
    const result = translateFilters([{ field: "installationDate", op: "newerThanYears", value: "2" }]);
    const condition = (result as { AND: { installationDate?: { gt: Date } }[] }).AND[0];
    expect(condition.installationDate?.gt).toBeInstanceOf(Date);
  });

  it("translates installationDate before ISO date", () => {
    const result = translateFilters([{ field: "installationDate", op: "before", value: "2020-01-01" }]);
    const condition = (result as { AND: { installationDate?: { lt: Date } }[] }).AND[0];
    expect(condition.installationDate?.lt).toBeInstanceOf(Date);
  });

  it("translates installationDate after ISO date", () => {
    const result = translateFilters([{ field: "installationDate", op: "after", value: "2022-06-01" }]);
    const condition = (result as { AND: { installationDate?: { gt: Date } }[] }).AND[0];
    expect(condition.installationDate?.gt).toBeInstanceOf(Date);
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

  it("translates lastChanged newerThanDays", () => {
    const before = new Date();
    const result = translateFilters([{ field: "lastChanged", op: "newerThanDays", value: "7" }]);
    const condition = (result as { AND: { updatedAt?: { gt: Date } }[] }).AND[0];
    expect(condition.updatedAt?.gt).toBeInstanceOf(Date);
    expect(condition.updatedAt!.gt.getTime()).toBeLessThanOrEqual(before.getTime());
  });

  it("translates lastChanged olderThanDays", () => {
    const result = translateFilters([{ field: "lastChanged", op: "olderThanDays", value: "30" }]);
    const condition = (result as { AND: { updatedAt?: { lt: Date } }[] }).AND[0];
    expect(condition.updatedAt?.lt).toBeInstanceOf(Date);
  });

  it("translates lastChanged before ISO date", () => {
    const result = translateFilters([{ field: "lastChanged", op: "before", value: "2024-01-01" }]);
    const condition = (result as { AND: { updatedAt?: { lt: Date } }[] }).AND[0];
    expect(condition.updatedAt?.lt).toBeInstanceOf(Date);
  });

  it("translates lastChanged after ISO date", () => {
    const result = translateFilters([{ field: "lastChanged", op: "after", value: "2024-06-01" }]);
    const condition = (result as { AND: { updatedAt?: { gt: Date } }[] }).AND[0];
    expect(condition.updatedAt?.gt).toBeInstanceOf(Date);
  });

  it("ignores lastChanged newerThanDays with non-numeric value", () => {
    const result = translateFilters([{ field: "lastChanged", op: "newerThanDays", value: "abc" }]);
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
        model: "Dell XPS",
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
    mockQueryRaw.mockResolvedValue([{ id: "loc1", name: "Room 101", parentId: null }] as never);

    const result = await runAssetReport({
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
    mockQueryRaw.mockResolvedValue([
      { id: "campus1", name: "Campus 14", parentId: null },
      { id: "building1", name: "Building 10", parentId: "campus1" },
      { id: "room1", name: "Room A", parentId: "building1" },
    ] as never);

    const result = await runAssetReport({ filters: [], groupBy: "none", columns: ["location"] });
    expect(result.rows[0].location).toBe("Campus 14 - Building 10 - Room A");
  });

  it("maps a row with all optional fields null (no location, no dates)", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "a0", model: null, serialNumber: null, hostname: null, locationId: null,
        installationDate: null, invoiceDate: null, invoiceNumber: null, notes: null,
        updatedAt: null, type: null, manufacturer: null, location: null,
      } as never,
    ]);
    const result = await runAssetReport({ filters: [], groupBy: "none", columns: ["model", "location"] });
    expect(result.total).toBe(1);
    const r = result.rows[0];
    expect(r.model).toBeNull();
    expect(r.type).toBeNull();
    expect(r.manufacturer).toBeNull();
    expect(r.location).toBeNull();
    expect(r.installationDate).toBeNull();
    expect(r.invoiceDate).toBeNull();
    expect(r.lastChanged).toBeNull();
    // no location ids → resolveLocationPathsBatch not queried
    expect(mockQueryRaw).not.toHaveBeenCalled();
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
    mockQueryRaw.mockResolvedValue([{ id: "other", name: "x", parentId: null }] as never);
    const result = await runAssetReport({ filters: [], groupBy: "none", columns: ["location"] });
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

    const result = await runAssetReport({ filters: [], groupBy: "manufacturer", columns: ["model"] });
    expect(result.groups).toContainEqual({ label: "Epson", count: 5 });
  });

  it("groups by location", async () => {
    mockFindMany.mockResolvedValue([]);
    mockGroupBy.mockResolvedValue([
      { locationId: "l1", _count: { id: 2 } } as never,
    ]);
    mockQueryRaw.mockResolvedValue([{ id: "l1", name: "Lab A", parentId: null }] as never);

    const result = await runAssetReport({ filters: [], groupBy: "location", columns: ["model"] });
    expect(result.groups).toContainEqual({ label: "Lab A", count: 2 });
  });

  it("groups by installationYear from asset rows", async () => {
    mockFindMany.mockResolvedValue([
      { id: "a1", model: null, serialNumber: null, hostname: null, locationId: "l1", installationDate: new Date("2020-03-01"), invoiceDate: null, invoiceNumber: null, notes: null, type: null, manufacturer: null, location: { id: "l1", name: "X" } } as never,
      { id: "a2", model: null, serialNumber: null, hostname: null, locationId: "l1", installationDate: new Date("2020-07-01"), invoiceDate: null, invoiceNumber: null, notes: null, type: null, manufacturer: null, location: { id: "l1", name: "X" } } as never,
      { id: "a3", model: null, serialNumber: null, hostname: null, locationId: "l1", installationDate: new Date("2022-01-01"), invoiceDate: null, invoiceNumber: null, notes: null, type: null, manufacturer: null, location: { id: "l1", name: "X" } } as never,
    ]);
    mockQueryRaw.mockResolvedValue([{ id: "l1", name: "X", parentId: null }] as never);

    const result = await runAssetReport({ filters: [], groupBy: "installationYear", columns: ["model"] });
    expect(result.groups).toContainEqual({ label: "2020", count: 2 });
    expect(result.groups).toContainEqual({ label: "2022", count: 1 });
  });
});
