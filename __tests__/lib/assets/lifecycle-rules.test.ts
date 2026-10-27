import { describe, it, expect } from "vitest";
import {
  AssetLifecycleError,
  assertDecommissionable,
  assertRepairable,
  assertReturnableToStock,
  buildStockItemFromReturn,
  buildDecommissionUpdateData,
  buildSendForRepairUpdateData,
} from "@/lib/assets/lifecycle-rules";

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

  it("does not throw for an asset in repair", () => {
    expect(() => assertDecommissionable({ status: "IN_REPAIR" })).not.toThrow();
  });
});

describe("assertRepairable", () => {
  it("throws ALREADY_DECOMMISSIONED when already decommissioned", () => {
    try {
      assertRepairable({ status: "DECOMMISSIONED" });
      expect.unreachable();
    } catch (err) {
      expect((err as AssetLifecycleError).code).toBe("ALREADY_DECOMMISSIONED");
    }
  });

  it("throws ALREADY_IN_REPAIR when already in repair", () => {
    try {
      assertRepairable({ status: "IN_REPAIR" });
      expect.unreachable();
    } catch (err) {
      expect((err as AssetLifecycleError).code).toBe("ALREADY_IN_REPAIR");
    }
  });

  it("does not throw for an installed asset", () => {
    expect(() => assertRepairable({ status: "INSTALLED" })).not.toThrow();
  });
});

describe("assertReturnableToStock", () => {
  it("throws ALREADY_DECOMMISSIONED first, even if type/model are also missing", () => {
    try {
      assertReturnableToStock({ status: "DECOMMISSIONED", typeId: null, modelId: null });
      expect.unreachable();
    } catch (err) {
      expect((err as AssetLifecycleError).code).toBe("ALREADY_DECOMMISSIONED");
    }
  });

  it("throws MISSING_TYPE when typeId is null", () => {
    try {
      assertReturnableToStock({ status: "INSTALLED", typeId: null, modelId: "model-1" });
      expect.unreachable();
    } catch (err) {
      expect((err as AssetLifecycleError).code).toBe("MISSING_TYPE");
    }
  });

  it("throws MISSING_MODEL when model is null", () => {
    try {
      assertReturnableToStock({ status: "INSTALLED", typeId: "t1", modelId: null });
      expect.unreachable();
    } catch (err) {
      expect((err as AssetLifecycleError).code).toBe("MISSING_MODEL");
    }
  });

  it("does not throw when status/type/model are all valid", () => {
    expect(() =>
      assertReturnableToStock({ status: "INSTALLED", typeId: "t1", modelId: "model-1" })
    ).not.toThrow();
  });

  it("does not throw for an asset in repair (repair -> stock is a valid exit)", () => {
    expect(() =>
      assertReturnableToStock({ status: "IN_REPAIR", typeId: "t1", modelId: "model-1" })
    ).not.toThrow();
  });
});

describe("buildStockItemFromReturn", () => {
  const BASE = {
    lineageId: "lineage-1",
    typeId: "t1",
    manufacturerId: "m1",
    modelId: "model-1",
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

  it("builds the create payload with quantity locked to 1, the given locationId, the source lineageId, and no metadata when nothing extra is set", () => {
    const data = buildStockItemFromReturn(BASE, "loc-1");
    expect(data).toMatchObject({
      lineageId: "lineage-1",
      typeId: "t1",
      manufacturerId: "m1",
      modelId: "model-1",
      serialNumber: "SN-1",
      quantity: 1,
      locationId: "loc-1",
      metadata: null,
    });
  });

  it("packs MAC addresses, custom fields, hostname, warranty, and vault path into metadata JSON", () => {
    const data = buildStockItemFromReturn({
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

  it("clears any stale repair fields (harmless no-op from INSTALLED, required when decommissioning from IN_REPAIR)", () => {
    const data = buildDecommissionUpdateData({
      note: "Repair failed, written off",
      disposalMethod: "DESTROYED",
      actorId: "u1",
      location: { name: "Room 101", fiNumber: null },
    });
    expect(data).toMatchObject({
      repairStartedAt: null,
      repairNote: null,
      sentForRepairById: null,
    });
  });
});

describe("buildSendForRepairUpdateData", () => {
  it("sets status, repairStartedAt, note, and actor", () => {
    const data = buildSendForRepairUpdateData({ note: "Sent to vendor", actorId: "u1" });
    expect(data).toMatchObject({
      status: "IN_REPAIR",
      repairNote: "Sent to vendor",
      sentForRepairById: "u1",
    });
    expect(data.repairStartedAt).toBeInstanceOf(Date);
  });

  it("allows a null note", () => {
    const data = buildSendForRepairUpdateData({ note: null, actorId: "u1" });
    expect(data.repairNote).toBeNull();
  });
});
