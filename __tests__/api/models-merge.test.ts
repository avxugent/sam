import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    model: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { POST } from "@/app/api/models/[id]/merge/route";

const mockAuth = vi.mocked(auth);
const mockLogAudit = vi.mocked(logAudit);
const session = (role = "ADMIN") => ({ user: { id: "u1", role, email: "a@b.com" } });
const params = (id = "mo1") => Promise.resolve({ id });
function post(body: object) {
  return new NextRequest("http://localhost/api/models/mo1/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// tx mock: both asset and stock item updateMany report a moved count — the
// regression guard for the gap the old free-text manufacturer/model merge
// routes had (they only ever touched `assets`, never `stock_items`).
const tx = {
  asset: { updateMany: vi.fn().mockResolvedValue({ count: 3 }) },
  stockItem: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
  model: { delete: vi.fn().mockResolvedValue({}) },
};

beforeEach(() => {
  vi.clearAllMocks();
  tx.asset.updateMany.mockResolvedValue({ count: 3 });
  tx.stockItem.updateMany.mockResolvedValue({ count: 2 });
  tx.model.delete.mockResolvedValue({});
  vi.mocked(prisma.$transaction).mockImplementation(((cb: (t: typeof tx) => unknown) => cb(tx)) as never);
});

describe("POST /api/models/[id]/merge", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await POST(post({ targetId: "mo2" }), { params: params() })).status).toBe(401);
  });

  it("returns 403 for non-admin roles", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    expect((await POST(post({ targetId: "mo2" }), { params: params() })).status).toBe(403);
  });

  it("returns 400 when merging a model into itself", async () => {
    mockAuth.mockResolvedValue(session() as never);
    expect((await POST(post({ targetId: "mo1" }), { params: params() })).status).toBe(400);
  });

  it("returns 404 when source or target is missing", async () => {
    mockAuth.mockResolvedValue(session() as never);
    vi.mocked(prisma.model.findUnique).mockResolvedValue(null as never);
    expect((await POST(post({ targetId: "mo2" }), { params: params() })).status).toBe(404);
  });

  it("reassigns BOTH assets and stock items, deletes the source, and audits", async () => {
    mockAuth.mockResolvedValue(session() as never);
    vi.mocked(prisma.model.findUnique)
      .mockResolvedValueOnce({ id: "mo1", name: "PowerEdge R740" } as never)
      .mockResolvedValueOnce({ id: "mo2", name: "poweredge r740" } as never);

    const res = await POST(post({ targetId: "mo2" }), { params: params() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, assetsMoved: 3, stockItemsMoved: 2 });

    expect(tx.asset.updateMany).toHaveBeenCalledWith({ where: { modelId: "mo1" }, data: { modelId: "mo2" } });
    expect(tx.stockItem.updateMany).toHaveBeenCalledWith({ where: { modelId: "mo1" }, data: { modelId: "mo2" } });
    expect(tx.model.delete).toHaveBeenCalledWith({ where: { id: "mo1" } });

    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "DELETE",
        entityType: "Model",
        entityId: "mo1",
        detail: {
          mergedInto: { id: "mo2", name: "poweredge r740" },
          assetsMoved: 3,
          stockItemsMoved: 2,
        },
      })
    );
  });
});
