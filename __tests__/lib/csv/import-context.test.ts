import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    assetType: { findMany: vi.fn(), upsert: vi.fn() },
    manufacturer: { findMany: vi.fn(), upsert: vi.fn() },
    supplier: { findMany: vi.fn(), upsert: vi.fn() },
    model: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    location: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  },
}));
vi.mock("@/lib/assets/defaults", () => ({ resolveAssetCreationDefaults: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { resolveAssetCreationDefaults } from "@/lib/assets/defaults";
import { loadImportContext } from "@/lib/csv/import-context";

const db = vi.mocked(prisma, true);
const mockDefaults = vi.mocked(resolveAssetCreationDefaults);

beforeEach(() => {
  vi.clearAllMocks();
  db.assetType.findMany.mockResolvedValue([
    { id: "t-server", name: "Server", hostnamePattern: "^srv-" },
    { id: "t-switch", name: "Switch", hostnamePattern: null },
  ] as never);
  db.manufacturer.findMany.mockResolvedValue([{ id: "m-dell", name: "Dell" }] as never);
  db.supplier.findMany.mockResolvedValue([{ id: "s-acme", name: "Acme" }] as never);
  db.model.findMany.mockResolvedValue([
    { id: "mod-r640", typeId: "t-server", manufacturerId: "m-dell", name: "PowerEdge R640" },
    { id: "mod-generic", typeId: "t-switch", manufacturerId: null, name: "Generic" },
  ] as never);
  db.user.findMany.mockResolvedValue([{ id: "u-1", email: "Alice@Example.com" }] as never);
  db.location.findMany.mockResolvedValue([
    { id: "l-campus", name: "Campus A", parentId: null, fiNumber: null },
    { id: "l-bldg", name: "Building 1", parentId: "l-campus", fiNumber: null },
    { id: "l-room", name: "Room 101", parentId: "l-bldg", fiNumber: "14.10.100.013" },
    { id: "l-room2", name: "Room 102", parentId: "l-bldg", fiNumber: null },
  ] as never);
  mockDefaults.mockResolvedValue({ ownerId: "u-default", supplierId: "s-acme" });
});

describe("loadImportContext()", () => {
  it("resolves creation defaults once with no explicit values", async () => {
    const ctx = await loadImportContext();
    expect(ctx.creationDefaults).toEqual({ ownerId: "u-default", supplierId: "s-acme" });
    expect(mockDefaults).toHaveBeenCalledTimes(1);
    expect(mockDefaults).toHaveBeenCalledWith(prisma, {});
  });

  it("never selects user password hashes", async () => {
    await loadImportContext();
    expect(db.user.findMany).toHaveBeenCalledWith({ select: { id: true, email: true } });
  });

  it("maps user emails case-insensitively", async () => {
    const ctx = await loadImportContext();
    expect(ctx.userIdByEmail.get("alice@example.com")).toBe("u-1");
    expect(ctx.userIdByEmail.has("Alice@Example.com")).toBe(false);
  });

  describe("type / manufacturer / supplier names", () => {
    it("match existing rows case-insensitively without writing", async () => {
      const ctx = await loadImportContext();
      expect(await ctx.typeId("SERVER")).toBe("t-server");
      expect(await ctx.manufacturerId("dell")).toBe("m-dell");
      expect(await ctx.supplierId("ACME")).toBe("s-acme");
      expect(db.assetType.upsert).not.toHaveBeenCalled();
      expect(db.manufacturer.upsert).not.toHaveBeenCalled();
      expect(db.supplier.upsert).not.toHaveBeenCalled();
    });

    it("upsert an unknown name once and cache it for later rows (any casing)", async () => {
      db.assetType.upsert.mockResolvedValue({ id: "t-new" } as never);
      db.manufacturer.upsert.mockResolvedValue({ id: "m-new" } as never);
      db.supplier.upsert.mockResolvedValue({ id: "s-new" } as never);
      const ctx = await loadImportContext();

      expect(await ctx.typeId("Printer")).toBe("t-new");
      expect(await ctx.typeId("PRINTER")).toBe("t-new");
      expect(db.assetType.upsert).toHaveBeenCalledTimes(1);
      expect(db.assetType.upsert).toHaveBeenCalledWith({ where: { name: "Printer" }, create: { name: "Printer" }, update: {} });

      expect(await ctx.manufacturerId("HP")).toBe("m-new");
      expect(await ctx.manufacturerId("hp")).toBe("m-new");
      expect(db.manufacturer.upsert).toHaveBeenCalledTimes(1);
      expect(db.manufacturer.upsert).toHaveBeenCalledWith({ where: { name: "HP" }, create: { name: "HP" }, update: {} });

      expect(await ctx.supplierId("Bechtle")).toBe("s-new");
      expect(await ctx.supplierId("bechtle")).toBe("s-new");
      expect(db.supplier.upsert).toHaveBeenCalledTimes(1);
    });
  });

  describe("hostnamePattern()", () => {
    it("returns the type's pattern, null for no pattern, an unknown/new type or no type", async () => {
      db.assetType.upsert.mockResolvedValue({ id: "t-new" } as never);
      const ctx = await loadImportContext();
      expect(ctx.hostnamePattern("t-server")).toBe("^srv-");
      expect(ctx.hostnamePattern("t-switch")).toBeNull();
      expect(ctx.hostnamePattern(await ctx.typeId("Printer"))).toBeNull();
      expect(ctx.hostnamePattern(null)).toBeNull();
    });
  });

  describe("modelId()", () => {
    it("matches an existing model scoped to type and manufacturer, case-insensitively", async () => {
      const ctx = await loadImportContext();
      expect(ctx.modelId("t-server", "m-dell", "poweredge r640")).toBe("mod-r640");
      expect(ctx.modelId("t-switch", null, "GENERIC")).toBe("mod-generic");
    });

    it("returns null for another type/manufacturer, an unknown name or no type, and never creates", async () => {
      const ctx = await loadImportContext();
      expect(ctx.modelId("t-switch", "m-dell", "PowerEdge R640")).toBeNull();
      expect(ctx.modelId("t-server", null, "PowerEdge R640")).toBeNull();
      expect(ctx.modelId("t-server", "m-dell", "R740")).toBeNull();
      expect(ctx.modelId(null, "m-dell", "PowerEdge R640")).toBeNull();
      expect(db).not.toHaveProperty("model.create");
    });
  });

  describe("locationId()", () => {
    it("routes a known FI number to its room, ignoring name drift", async () => {
      const ctx = await loadImportContext();
      const id = await ctx.locationId({ campus: "Other", building: "Elsewhere", room: "Renamed", fiNumber: "14.10.100.013" });
      expect(id).toBe("l-room");
      expect(db.location.create).not.toHaveBeenCalled();
      expect(db.location.updateMany).not.toHaveBeenCalled();
    });

    it("resolves an existing campus/building/room path case-insensitively", async () => {
      const ctx = await loadImportContext();
      expect(await ctx.locationId({ campus: "campus a", building: "BUILDING 1", room: "room 102", fiNumber: null })).toBe("l-room2");
      expect(db.location.create).not.toHaveBeenCalled();
    });

    it("creates missing levels under their parents and caches them", async () => {
      db.location.create
        .mockResolvedValueOnce({ id: "l-bldg2" } as never)
        .mockResolvedValueOnce({ id: "l-room-new" } as never);
      const ctx = await loadImportContext();

      const row = { campus: "Campus A", building: "Building 2", room: "Lab", fiNumber: null };
      expect(await ctx.locationId(row)).toBe("l-room-new");
      expect(db.location.create).toHaveBeenNthCalledWith(1, { data: { name: "Building 2", parentId: "l-campus", fiNumber: null } });
      expect(db.location.create).toHaveBeenNthCalledWith(2, { data: { name: "Lab", parentId: "l-bldg2", fiNumber: null } });

      expect(await ctx.locationId({ ...row, building: "building 2", room: "LAB" })).toBe("l-room-new");
      expect(db.location.create).toHaveBeenCalledTimes(2);
    });

    it("hangs the room under the campus when there is no building, or at the root when neither", async () => {
      db.location.create
        .mockResolvedValueOnce({ id: "l-a" } as never)
        .mockResolvedValueOnce({ id: "l-b" } as never);
      const ctx = await loadImportContext();
      expect(await ctx.locationId({ campus: "Campus A", building: "", room: "Hall", fiNumber: null })).toBe("l-a");
      expect(db.location.create).toHaveBeenLastCalledWith({ data: { name: "Hall", parentId: "l-campus", fiNumber: null } });
      expect(await ctx.locationId({ campus: "", building: "", room: "Loose", fiNumber: null })).toBe("l-b");
      expect(db.location.create).toHaveBeenLastCalledWith({ data: { name: "Loose", parentId: null, fiNumber: null } });
    });

    it("creates a new room with the FI number and routes later rows with it there", async () => {
      db.location.create.mockResolvedValueOnce({ id: "l-new" } as never);
      const ctx = await loadImportContext();
      expect(await ctx.locationId({ campus: "Campus A", building: "Building 1", room: "Room 103", fiNumber: "14.10.100.099" })).toBe("l-new");
      expect(db.location.create).toHaveBeenCalledWith({ data: { name: "Room 103", parentId: "l-bldg", fiNumber: "14.10.100.099" } });
      expect(await ctx.locationId({ campus: "X", building: "Y", room: "Z", fiNumber: "14.10.100.099" })).toBe("l-new");
      expect(db.location.create).toHaveBeenCalledTimes(1);
    });

    it("applies a new FI number to an existing room only when it has none, recording it when applied", async () => {
      db.location.updateMany.mockResolvedValueOnce({ count: 1 } as never);
      const ctx = await loadImportContext();
      const row = { campus: "Campus A", building: "Building 1", room: "Room 102", fiNumber: "14.10.100.050" };
      expect(await ctx.locationId(row)).toBe("l-room2");
      expect(db.location.updateMany).toHaveBeenCalledWith({
        where: { id: "l-room2", fiNumber: null },
        data: { fiNumber: "14.10.100.050" },
      });
      // Now known: resolved by FI number without another update.
      expect(await ctx.locationId({ campus: "X", building: "Y", room: "Z", fiNumber: "14.10.100.050" })).toBe("l-room2");
      expect(db.location.updateMany).toHaveBeenCalledTimes(1);
    });

    it("does not record the FI number when the existing room kept its own", async () => {
      db.location.updateMany.mockResolvedValue({ count: 0 } as never);
      db.location.create.mockResolvedValue({ id: "l-z" } as never);
      const ctx = await loadImportContext();
      expect(await ctx.locationId({ campus: "Campus A", building: "Building 1", room: "Room 101", fiNumber: "14.10.100.777" })).toBe("l-room");
      // A later row with that FI number is not routed to l-room; it goes by name.
      expect(await ctx.locationId({ campus: "", building: "", room: "Z", fiNumber: "14.10.100.777" })).toBe("l-z");
      expect(db.location.create).toHaveBeenCalledWith({ data: { name: "Z", parentId: null, fiNumber: "14.10.100.777" } });
    });
  });
});
