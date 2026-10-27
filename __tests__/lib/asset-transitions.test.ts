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
import { AssetLifecycleError } from "@/lib/asset-lifecycle";
import {
  decommissionAsset,
  lifecycleViolationCode,
  lifecycleViolationResponse,
  returnAssetToStock,
} from "@/lib/asset-transitions";

const session = { user: { id: "u1", email: "a@x.com", role: "EDITOR" } } as never;
const req = new Request("http://x");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.$transaction).mockImplementation((async (fn: (tx: unknown) => unknown) => fn(prisma)) as never);
});

describe("lifecycle violation helpers", () => {
  const violate = () => {
    throw new AssetLifecycleError("ALREADY_DECOMMISSIONED", "Already decommissioned");
  };

  it("turn a rule violation into a 400 or its code", async () => {
    const res = lifecycleViolationResponse(violate);
    expect(res?.status).toBe(400);
    expect(await res?.json()).toEqual({ error: "Already decommissioned" });
    expect(lifecycleViolationCode(violate)).toBe("ALREADY_DECOMMISSIONED");
  });

  it("return null when the check passes and rethrow unrelated errors", () => {
    expect(lifecycleViolationResponse(() => {})).toBeNull();
    expect(lifecycleViolationCode(() => {})).toBeNull();
    expect(() => lifecycleViolationCode(() => { throw new Error("db"); })).toThrow("db");
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
