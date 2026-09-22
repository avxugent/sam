import { describe, it, expect } from "vitest";
import {
  AssetLifecycleError,
  assertDecommissionable,
  assertReturnableToStock,
  buildReturnToStockStockItemData,
  buildDecommissionUpdateData,
} from "@/lib/asset-lifecycle";

describe("assertDecommissionable", () => {
  it("throws ALREADY_DECOMMISSIONED when already decommissioned", () => {
    expect(() => assertDecommissionable({ status: "DECOMMISSIONED" })).toThrow(AssetLifecycleError);
    try {
      assertDecommissionable({ status: "DECOMMISSIONED" });
    } catch (err) {
      expect((err as AssetLifecycleError).code).toBe("ALREADY_DECOMMISSIONED");
    }
  });

  it("does not throw for an installed asset", () => {
    expect(() => assertDecommissionable({ status: "INSTALLED" })).not.toThrow();
  });
});

describe("assertReturnableToStock", () => {
  it("throws ALREADY_DECOMMISSIONED first, even if type/model are also missing", () => {
    try {
      assertReturnableToStock({ status: "DECOMMISSIONED", typeId: null, model: null });
      expect.unreachable();
    } catch (err) {
      expect((err as AssetLifecycleError).code).toBe("ALREADY_DECOMMISSIONED");
    }
  });

  it("throws MISSING_TYPE when typeId is null", () => {
    try {
      assertReturnableToStock({ status: "INSTALLED", typeId: null, model: "Dell" });
      expect.unreachable();
    } catch (err) {
      expect((err as AssetLifecycleError).code).toBe("MISSING_TYPE");
    }
  });

  it("throws MISSING_MODEL when model is null", () => {
    try {
      assertReturnableToStock({ status: "INSTALLED", typeId: "t1", model: null });
      expect.unreachable();
    } catch (err) {
      expect((err as AssetLifecycleError).code).toBe("MISSING_MODEL");
    }
  });

  it("does not throw when status/type/model are all valid", () => {
    expect(() =>
      assertReturnableToStock({ status: "INSTALLED", typeId: "t1", model: "Dell" })
    ).not.toThrow();
  });
});

describe("buildReturnToStockStockItemData", () => {
  const BASE = {
    typeId: "t1",
    manufacturerId: "m1",
    model: "Dell Monitor",
    serialNumber: "SN-1",
    invoiceNumber: null,
    invoiceDate: null,
    notes: null,
    hostname: null,
    warrantyMonths: null,
    vaultPath: null,
    macAddresses: [],
    customFields: [],
  };

  it("builds the create payload with quantity locked to 1, the given locationId, and no metadata when nothing extra is set", () => {
    const data = buildReturnToStockStockItemData(BASE, "loc-1");
    expect(data).toMatchObject({
      typeId: "t1",
      manufacturerId: "m1",
      model: "Dell Monitor",
      serialNumber: "SN-1",
      quantity: 1,
      locationId: "loc-1",
      metadata: null,
    });
  });

  it("packs MAC addresses, custom fields, hostname, warranty, and vault path into metadata JSON", () => {
    const data = buildReturnToStockStockItemData({
      ...BASE,
      macAddresses: [{ address: "AA:BB:CC:DD:EE:FF" }],
      customFields: [{ key: "asset tag", value: "1234" }],
      hostname: "host1",
      warrantyMonths: 24,
      vaultPath: "secret/host1",
    }, "loc-1");
    expect(JSON.parse(data.metadata as string)).toEqual({
      macAddresses: [{ address: "AA:BB:CC:DD:EE:FF" }],
      customFields: [{ key: "asset tag", value: "1234" }],
      hostname: "host1",
      warrantyMonths: 24,
      vaultPath: "secret/host1",
    });
  });
});

describe("buildDecommissionUpdateData", () => {
  it("sets status, disposal fields, actor and location snapshot", () => {
    const data = buildDecommissionUpdateData({
      note: "End of life",
      disposalMethod: "WIPED",
      actorId: "u1",
      location: { name: "Room 101", fiNumber: "14.10.100.013" },
    });
    expect(data).toMatchObject({
      status: "DECOMMISSIONED",
      decommissionNote: "End of life",
      disposalMethod: "WIPED",
      decommissionedById: "u1",
      lastLocationName: "Room 101",
      lastLocationFiNumber: "14.10.100.013",
    });
    expect(data.decommissionedAt).toBeInstanceOf(Date);
  });

  it("defaults fiNumber to null when the location has none", () => {
    const data = buildDecommissionUpdateData({
      note: null,
      disposalMethod: "OTHER",
      actorId: "u1",
      location: { name: "Room 101", fiNumber: null },
    });
    expect(data.lastLocationFiNumber).toBeNull();
  });
});
