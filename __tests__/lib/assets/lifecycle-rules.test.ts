import { describe, it, expect } from "vitest";
import {
  decommissionViolation,
  repairViolation,
  returnToStockViolation,
  reinstateViolation,
  buildReinstateUpdateData,
  buildStockItemFromReturn,
  buildDecommissionUpdateData,
  buildSendForRepairUpdateData,
} from "@/lib/assets/lifecycle-rules";

describe("decommissionViolation", () => {
  it("is ALREADY_DECOMMISSIONED for a decommissioned asset", () => {
    expect(decommissionViolation({ status: "DECOMMISSIONED" })?.code).toBe("ALREADY_DECOMMISSIONED");
  });

  it("is null for installed and in-repair assets", () => {
    expect(decommissionViolation({ status: "INSTALLED" })).toBeNull();
    expect(decommissionViolation({ status: "IN_REPAIR" })).toBeNull();
  });
});

describe("repairViolation", () => {
  it("refuses decommissioned and already-in-repair assets", () => {
    expect(repairViolation({ status: "DECOMMISSIONED" })?.code).toBe("ALREADY_DECOMMISSIONED");
    expect(repairViolation({ status: "IN_REPAIR" })).toEqual({
      code: "ALREADY_IN_REPAIR",
      message: "Asset is already sent for repair.",
    });
  });

  it("is null for an installed asset", () => {
    expect(repairViolation({ status: "INSTALLED" })).toBeNull();
  });
});

describe("returnToStockViolation", () => {
  it("reports ALREADY_DECOMMISSIONED first, even if type/model are also missing", () => {
    expect(returnToStockViolation({ status: "DECOMMISSIONED", typeId: null, modelId: null })?.code).toBe(
      "ALREADY_DECOMMISSIONED"
    );
  });

  it("requires a type, then a model", () => {
    expect(returnToStockViolation({ status: "INSTALLED", typeId: null, modelId: "model-1" })?.code).toBe("MISSING_TYPE");
    expect(returnToStockViolation({ status: "INSTALLED", typeId: "t1", modelId: null })?.code).toBe("MISSING_MODEL");
  });

  it("is null for valid installed and in-repair assets (repair -> stock is a valid exit)", () => {
    expect(returnToStockViolation({ status: "INSTALLED", typeId: "t1", modelId: "model-1" })).toBeNull();
    expect(returnToStockViolation({ status: "IN_REPAIR", typeId: "t1", modelId: "model-1" })).toBeNull();
  });
});

describe("reinstateViolation / buildReinstateUpdateData", () => {
  it("only reinstates decommissioned assets", () => {
    expect(reinstateViolation({ status: "INSTALLED" })?.code).toBe("NOT_DECOMMISSIONED");
    expect(reinstateViolation({ status: "DECOMMISSIONED" })).toBeNull();
  });

  it("clears the disposal evidence", () => {
    expect(buildReinstateUpdateData()).toEqual({
      status: "INSTALLED",
      decommissionedAt: null,
      decommissionNote: null,
      disposalMethod: null,
      decommissionedById: null,
    });
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
