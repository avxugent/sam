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
  it("turns a violation into a 400 with its message, and passes null through", async () => {
    const res = lifecycleViolationResponse({ code: "ALREADY_DECOMMISSIONED", message: "Already decommissioned" });
    expect(res?.status).toBe(400);
    expect(await res?.json()).toEqual({ error: "Already decommissioned" });
    expect(lifecycleViolationResponse(null)).toBeNull();
  });
});

describe("decommissionAsset()", () => {
  it("records the disposal and audits the last location", async () => {
    vi.mocked(prisma.asset.update).mockResolvedValue({ id: "a1" } as never);
    const existing = { model: { name: "XPS" }, status: "INSTALLED", lineageId: "lin", location: { name: "Room 1", fiNumber: "14.10.100.013" } };
    await decommissionAsset(req, session, "a1", existing as never, { note: "broken", disposalMethod: "WIPED" });

    const data = vi.mocked(prisma.asset.update).mock.calls[0][0].data as Record<string, unknown>;
    expect(data).toMatchObject({ status: "DECOMMISSIONED", disposalMethod: "WIPED", decommissionNote: "broken" });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "UPDATE", entityId: "a1", lineageId: "lin", detail: expect.objectContaining({ lastLocation: "Room 1" }) })
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
    const item = await returnAssetToStock(req, session, asset as never, "store");
    expect(item.id).toBe("s1");
    expect(prisma.asset.delete).toHaveBeenCalledWith({ where: { id: "a1" } });
    expect(vi.mocked(logAudit).mock.calls.map(([e]) => [e.action, e.entityType])).toEqual([
      ["DELETE", "Asset"],
      ["CREATE", "StockItem"],
    ]);
  });
});

describe("status-guarded writes", () => {
  const existing = { model: { name: "XPS" }, status: "INSTALLED", lineageId: "lin", location: { name: "Room 1", fiNumber: null } };

  it("only writes while the asset still has the checked status", async () => {
    vi.mocked(prisma.asset.update).mockResolvedValue({ id: "a1" } as never);
    await sendAssetForRepair(req, session, "a1", existing as never, "fan");
    expect(vi.mocked(prisma.asset.update).mock.calls[0][0].where).toEqual({ id: "a1", status: "INSTALLED" });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ detail: { status: "IN_REPAIR", note: "fan" } }));
  });

  it.each([
    ["decommission", () => decommissionAsset(req, session, "a1", existing as never, { disposalMethod: "WIPED" })],
    ["repair", () => sendAssetForRepair(req, session, "a1", existing as never, null)],
    ["reinstate", () => reinstateAsset(req, session, "a1", { ...existing, status: "DECOMMISSIONED" } as never)],
  ])("%s returns null without auditing when a concurrent change won", async (_name, call) => {
    vi.mocked(prisma.asset.update).mockRejectedValue(notFound());
    expect(await call()).toBeNull();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("return to stock rolls back when the asset changed meanwhile", async () => {
    vi.mocked(prisma.stockItem.create).mockResolvedValue({ id: "s1", lineageId: "lin" } as never);
    vi.mocked(prisma.asset.delete).mockRejectedValue(notFound());
    const asset = { id: "a1", status: "INSTALLED", lineageId: "lin", typeId: "t1", manufacturerId: null, modelId: "m1", serialNumber: null, notes: null, macAddresses: [], customFields: [], location: { name: "R" }, model: { name: "X" } };
    expect(await returnAssetToStock(req, session, asset as never, "l2")).toBeNull();
    expect(vi.mocked(prisma.asset.delete).mock.calls[0][0].where).toEqual({ id: "a1", status: "INSTALLED" });
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("rethrows other database errors", async () => {
    vi.mocked(prisma.asset.update).mockRejectedValue(new Error("db down"));
    await expect(reinstateAsset(req, session, "a1", existing as never)).rejects.toThrow("db down");
  });

  it("statusChangedResponse() is a 409 with a stable code", async () => {
    const res = statusChangedResponse();
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "statusChanged" });
  });
});
