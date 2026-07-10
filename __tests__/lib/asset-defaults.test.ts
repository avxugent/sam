import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveAssetCreationDefaults } from "@/lib/asset-defaults";

const db = {
  appSetting: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
  supplier: { findMany: vi.fn() },
};

const TODAY = new Date("2026-07-09T10:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  db.appSetting.findUnique.mockResolvedValue(null);
  db.user.findUnique.mockResolvedValue(null);
  db.supplier.findMany.mockResolvedValue([]);
});

describe("resolveAssetCreationDefaults()", () => {
  it("keeps explicitly provided values without touching the db", async () => {
    const result = await resolveAssetCreationDefaults(
      db as never,
      { ownerId: "u1", supplierId: "s1" },
      TODAY
    );
    expect(result).toEqual({ ownerId: "u1", supplierId: "s1" });
    expect(db.appSetting.findUnique).not.toHaveBeenCalled();
    expect(db.supplier.findMany).not.toHaveBeenCalled();
  });

  it("explicit null stays null (cleared, no default applied)", async () => {
    const result = await resolveAssetCreationDefaults(
      db as never,
      { ownerId: null, supplierId: null },
      TODAY
    );
    expect(result).toEqual({ ownerId: null, supplierId: null });
    expect(db.appSetting.findUnique).not.toHaveBeenCalled();
  });

  it("applies the default owner setting when the referenced user exists", async () => {
    db.appSetting.findUnique.mockResolvedValue({ value: "team-user" });
    db.user.findUnique.mockResolvedValue({ id: "team-user" });
    const result = await resolveAssetCreationDefaults(db as never, {}, TODAY);
    expect(result.ownerId).toBe("team-user");
  });

  it("falls back to null when the default owner user was deleted", async () => {
    db.appSetting.findUnique.mockResolvedValue({ value: "gone" });
    db.user.findUnique.mockResolvedValue(null);
    const result = await resolveAssetCreationDefaults(db as never, {}, TODAY);
    expect(result.ownerId).toBeNull();
  });

  it("resolves the supplier from the active default window", async () => {
    db.supplier.findMany.mockResolvedValue([
      { id: "old", defaultFrom: new Date("2025-01-01"), defaultUntil: new Date("2025-12-31") },
      { id: "cur", defaultFrom: new Date("2026-01-01"), defaultUntil: null },
    ]);
    const result = await resolveAssetCreationDefaults(db as never, {}, TODAY);
    expect(result.supplierId).toBe("cur");
  });

  it("returns null supplier when no window is active", async () => {
    db.supplier.findMany.mockResolvedValue([
      { id: "old", defaultFrom: new Date("2025-01-01"), defaultUntil: new Date("2025-12-31") },
    ]);
    const result = await resolveAssetCreationDefaults(db as never, {}, TODAY);
    expect(result.supplierId).toBeNull();
  });
});
