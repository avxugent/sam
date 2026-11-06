import { historyLabelKey } from "@/components/assets/asset-history-timeline";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    asset: { update: vi.fn(), delete: vi.fn() },
    stockItem: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import {
  decommissionAsset,
  lifecycleViolationResponse,
  reinstateAsset,
  returnAssetToStock,
  sendAssetForRepair,
  statusChangedResponse,
} from "@/lib/assets/transitions";

const notFound = () => Object.assign(new Error("Record to update not found."), { code: "P2025" });

const session = { user: { id: "u1", email: "a@x.com", role: "EDITOR" } } as never;
const req = new Request("http://x");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation((async (fn: (tx: unknown) => unknown) => fn(prisma)) as never);
});

describe("lifecycleViolationResponse()", () => {
  it("turns a violation into a 400 with its message and code, and passes null through", async () => {
    const res = lifecycleViolationResponse({ code: "ALREADY_DECOMMISSIONED", message: "Already decommissioned" });
    expect(res?.status).toBe(400);
    expect(await res?.json()).toEqual({ error: "Already decommissioned", code: "ALREADY_DECOMMISSIONED" });
    expect(lifecycleViolationResponse(null)).toBeNull();
  });
});

describe("decommissionAsset()", () => {
  it("records the disposal and audits the last location", async () => {
    vi.mocked(prisma.asset.update).mockResolvedValue({ id: "a1" } as never);
    const existing = { id: "a1", model: { name: "XPS" }, hostname: null, serialNumber: null, status: "INSTALLED", lineageId: "lin", location: { name: "Room 1", fiNumber: "14.10.100.013" } };
    await decommissionAsset(req, session, existing as never, { note: "broken", disposalMethod: "WIPED" });

    const data = vi.mocked(prisma.asset.update).mock.calls[0][0].data as Record<string, unknown>;
    expect(data).toMatchObject({ status: "DECOMMISSIONED", disposalMethod: "WIPED", decommissionNote: "broken" });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "UPDATE", entityId: "a1", entityName: "XPS", lineageId: "lin", detail: expect.objectContaining({ lastLocation: "Room 1" }) })
    );
  });
});

describe("returnAssetToStock()", () => {
  it("swaps the asset for a stock item and audits both sides", async () => {
    vi.mocked(prisma.stockItem.create).mockResolvedValue({ id: "s1", lineageId: "lin" } as never);
    const asset = {
      id: "a1",
      lineageId: "lin",
      typeId: "t1",
      manufacturerId: null,
      modelId: "m1",
      serialNumber: null,
      invoiceNumber: null,
      invoiceDate: null,
      notes: null,
      hostname: null,
      warrantyMonths: null,
      vaultPath: null,
      macAddresses: [],
      customFields: [],
      location: { name: "Room 1" },
      model: { name: "XPS" },
    };
    const item = await returnAssetToStock(req, session, asset as never, { locationId: "store" });
    expect(item.id).toBe("s1");
    expect(prisma.asset.delete).toHaveBeenCalledWith({ where: { id: "a1" } });
    expect(vi.mocked(logAudit).mock.calls.map(([e]) => [e.action, e.entityType])).toEqual([
      ["DELETE", "Asset"],
      ["CREATE", "StockItem"],
    ]);
  });

  it("writes entries the asset history timeline reads as a return to stock", async () => {
    const asset = {
      id: "a1", typeId: "t1", modelId: "m1", status: "INSTALLED", lineageId: "lin",
      location: { name: "Room 1" }, model: { name: "XPS" }, macAddresses: [], customFields: [],
    };
    await returnAssetToStock(req, session, asset as never, { locationId: "store" });
    const labels = vi.mocked(logAudit).mock.calls.map(([e]) =>
      historyLabelKey({ action: e.action, entityType: e.entityType, detail: JSON.stringify(e.detail) } as never)
    );
    expect(labels).toEqual(["returnedToStock", "returnedToStock"]);
  });
});

describe("status-guarded writes", () => {
  const existing = { id: "a1", model: { name: "XPS" }, hostname: null, serialNumber: null, status: "INSTALLED", lineageId: "lin", location: { name: "Room 1", fiNumber: null } };

  it("only writes while the asset still has the checked status", async () => {
    vi.mocked(prisma.asset.update).mockResolvedValue({ id: "a1" } as never);
    await sendAssetForRepair(req, session, existing as never, { note: "fan" });
    expect(vi.mocked(prisma.asset.update).mock.calls[0][0].where).toEqual({ id: "a1", status: "INSTALLED" });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ detail: { status: "IN_REPAIR", note: "fan" } }));
  });

  it.each([
    ["decommission", () => decommissionAsset(req, session, existing as never, { disposalMethod: "WIPED" })],
    ["repair", () => sendAssetForRepair(req, session, existing as never, {})],
    ["reinstate", () => reinstateAsset(req, session, { ...existing, status: "DECOMMISSIONED" } as never)],
  ])("%s returns null without auditing when a concurrent change won", async (_name, call) => {
    vi.mocked(prisma.asset.update).mockRejectedValue(notFound());
    expect(await call()).toBeNull();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("return to stock rolls back when the asset changed meanwhile", async () => {
    vi.mocked(prisma.stockItem.create).mockResolvedValue({ id: "s1", lineageId: "lin" } as never);
    vi.mocked(prisma.asset.delete).mockRejectedValue(notFound());
    const asset = { id: "a1", status: "INSTALLED", lineageId: "lin", typeId: "t1", manufacturerId: null, modelId: "m1", serialNumber: null, notes: null, macAddresses: [], customFields: [], location: { name: "R" }, model: { name: "X" } };
    expect(await returnAssetToStock(req, session, asset as never, { locationId: "l2" })).toBeNull();
    expect(vi.mocked(prisma.asset.delete).mock.calls[0][0].where).toEqual({ id: "a1", status: "INSTALLED" });
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("names a model-less asset by its hostname in the audit entry", async () => {
    vi.mocked(prisma.asset.update).mockResolvedValue({ id: "a1" } as never);
    await reinstateAsset(req, session, { ...existing, model: null, hostname: "pc-01", status: "DECOMMISSIONED" } as never);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ entityName: "pc-01" }));
  });

  it("rethrows other database errors", async () => {
    vi.mocked(prisma.asset.update).mockRejectedValue(new Error("db down"));
    await expect(reinstateAsset(req, session, existing as never)).rejects.toThrow("db down");
  });

  it("statusChangedResponse() is a 409 with a stable code", async () => {
    const res = statusChangedResponse();
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "STATUS_CHANGED" });
  });
});
