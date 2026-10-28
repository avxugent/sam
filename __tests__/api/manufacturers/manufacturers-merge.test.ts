import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/models/reassign", () => ({ reassignModels: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  prisma: {
    manufacturer: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { reassignModels } from "@/lib/models/reassign";
import { POST } from "@/app/api/manufacturers/[id]/merge/route";

const mockAuth = vi.mocked(auth);
const mockLogAudit = vi.mocked(logAudit);
const session = (role = "ADMIN") => ({ user: { id: "u1", role, email: "a@b.com" } });
const params = (id = "m1") => Promise.resolve({ id });
function post(body: object) {
  return new NextRequest("http://localhost/api/manufacturers/m1/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// tx mock: asset.updateMany reports a moved count; overrides default to none.
const tx = {
  asset: { updateMany: vi.fn().mockResolvedValue({ count: 3 }) },
  stockItem: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
  manufacturer: { delete: vi.fn().mockResolvedValue({}) },
  assetTypeManufacturerTemplate: {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  tx.asset.updateMany.mockResolvedValue({ count: 3 });
  tx.stockItem.updateMany.mockResolvedValue({ count: 2 });
  vi.mocked(reassignModels).mockResolvedValue({ modelsMoved: 1, modelsFolded: 1 });
  tx.manufacturer.delete.mockResolvedValue({});
  tx.assetTypeManufacturerTemplate.findMany.mockResolvedValue([]);
  vi.mocked(prisma.$transaction).mockImplementation(((cb: (t: typeof tx) => unknown) => cb(tx)) as never);
});

describe("POST /api/manufacturers/[id]/merge", () => {
  it("401 unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await POST(post({ targetId: "m2" }), { params: params() })).status).toBe(401);
  });

  it("403 for non-admin", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    expect((await POST(post({ targetId: "m2" }), { params: params() })).status).toBe(403);
  });

  it("allows MAINTAINER", async () => {
    mockAuth.mockResolvedValue(session("MAINTAINER") as never);
    expect((await POST(post({ targetId: "m2" }), { params: params() })).status).not.toBe(403);
  });

  it("400 when merging a manufacturer into itself", async () => {
    mockAuth.mockResolvedValue(session() as never);
    expect((await POST(post({ targetId: "m1" }), { params: params() })).status).toBe(400);
  });

  it("404 when source or target is missing", async () => {
    mockAuth.mockResolvedValue(session() as never);
    vi.mocked(prisma.manufacturer.findUnique).mockResolvedValue(null as never);
    expect((await POST(post({ targetId: "m2" }), { params: params() })).status).toBe(404);
  });

  it("merges assets, stock and models, deletes source, and audits when there are no overrides", async () => {
    mockAuth.mockResolvedValue(session() as never);
    vi.mocked(prisma.manufacturer.findUnique)
      .mockResolvedValueOnce({ id: "m1", name: "Dell" } as never)
      .mockResolvedValueOnce({ id: "m2", name: "Dell Inc" } as never);

    const res = await POST(post({ targetId: "m2" }), { params: params() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, movedCount: 3 });
    expect(tx.stockItem.updateMany).toHaveBeenCalledWith({ where: { manufacturerId: "m1" }, data: { manufacturerId: "m2" } });
    expect(reassignModels).toHaveBeenCalledWith(tx, { manufacturerId: "m1" }, { manufacturerId: "m2" });
    expect(tx.assetTypeManufacturerTemplate.update).not.toHaveBeenCalled();
    expect(tx.assetTypeManufacturerTemplate.delete).not.toHaveBeenCalled();
    expect(tx.asset.updateMany).toHaveBeenCalledWith({ where: { manufacturerId: "m1" }, data: { manufacturerId: "m2" } });
    expect(tx.manufacturer.delete).toHaveBeenCalledWith({ where: { id: "m1" } });
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "DELETE",
        entityType: "Manufacturer",
        entityId: "m1",
        detail: expect.objectContaining({ assetsMoved: 3, stockMoved: 2, modelsMoved: 1, modelsFolded: 1 }),
      })
    );
  });

  it("reassigns a source override to the target when the target has none for that type", async () => {
    mockAuth.mockResolvedValue(session() as never);
    vi.mocked(prisma.manufacturer.findUnique)
      .mockResolvedValueOnce({ id: "m1", name: "Dell" } as never)
      .mockResolvedValueOnce({ id: "m2", name: "Dell Inc" } as never);
    tx.assetTypeManufacturerTemplate.findMany.mockResolvedValue([
      { id: "o1", typeId: "t1", manufacturerId: "m1", scrapeTargetTemplate: "__address__=https://x" },
    ]);
    tx.assetTypeManufacturerTemplate.findUnique.mockResolvedValue(null);

    const res = await POST(post({ targetId: "m2" }), { params: params() });
    expect(res.status).toBe(200);
    expect(tx.assetTypeManufacturerTemplate.update).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { manufacturerId: "m2" },
    });
    expect(tx.assetTypeManufacturerTemplate.delete).not.toHaveBeenCalled();
  });

  it("keeps the target's override and drops the source's on conflict for the same type", async () => {
    mockAuth.mockResolvedValue(session() as never);
    vi.mocked(prisma.manufacturer.findUnique)
      .mockResolvedValueOnce({ id: "m1", name: "Dell" } as never)
      .mockResolvedValueOnce({ id: "m2", name: "Dell Inc" } as never);
    tx.assetTypeManufacturerTemplate.findMany.mockResolvedValue([
      { id: "o1", typeId: "t1", manufacturerId: "m1", scrapeTargetTemplate: "__address__=https://source" },
    ]);
    tx.assetTypeManufacturerTemplate.findUnique.mockResolvedValue({
      id: "o2", typeId: "t1", manufacturerId: "m2", scrapeTargetTemplate: "__address__=https://target",
    });

    const res = await POST(post({ targetId: "m2" }), { params: params() });
    expect(res.status).toBe(200);
    expect(tx.assetTypeManufacturerTemplate.delete).toHaveBeenCalledWith({ where: { id: "o1" } });
    expect(tx.assetTypeManufacturerTemplate.update).not.toHaveBeenCalled();
  });
});
