import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/models/reassign", () => ({ reassignModels: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  prisma: {
    asset: { findMany: vi.fn(), updateMany: vi.fn() },
    assetType: { findUnique: vi.fn(), delete: vi.fn() },
    maintenancePreset: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { reassignModels } from "@/lib/models/reassign";
import { GET as listAssets } from "@/app/api/asset-types/[id]/assets/route";
import { POST as mergeType } from "@/app/api/asset-types/[id]/merge/route";
import { POST as createPreset } from "@/app/api/asset-types/[id]/presets/route";
import { PUT as updatePreset, DELETE as deletePreset } from "@/app/api/asset-types/presets/[id]/route";

const mockAuth = vi.mocked(auth);
const mockLogAudit = vi.mocked(logAudit);
const session = (role = "ADMIN") => ({ user: { id: "u1", role, email: "a@b.com" } });
const params = (id: string) => Promise.resolve({ id });
function jreq(url: string, body?: unknown, method = "POST") {
  return new NextRequest(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/asset-types/[id]/assets", () => {
  it("401 unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await listAssets(new Request("http://x"), { params: params("t1") })).status).toBe(401);
  });
  it("returns active assets by default (INSTALLED only)", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    vi.mocked(prisma.asset.findMany).mockResolvedValue([{ id: "a1", model: "M" }] as never);
    const res = await listAssets(new Request("http://x"), { params: params("t1") });
    expect(res.status).toBe(200);
    expect(vi.mocked(prisma.asset.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({ where: { typeId: "t1", status: "INSTALLED" } })
    );
    expect(await res.json()).toEqual([{ id: "a1", model: "M" }]);
  });
  it("lists decommissioned assets with ?status=DECOMMISSIONED", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    vi.mocked(prisma.asset.findMany).mockResolvedValue([] as never);
    await listAssets(new Request("http://x?status=DECOMMISSIONED"), { params: params("t1") });
    expect(vi.mocked(prisma.asset.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({ where: { typeId: "t1", status: "DECOMMISSIONED" } })
    );
  });
  it("lists all statuses with ?status=all", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    vi.mocked(prisma.asset.findMany).mockResolvedValue([] as never);
    await listAssets(new Request("http://x?status=all"), { params: params("t1") });
    expect(vi.mocked(prisma.asset.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({ where: { typeId: "t1" } })
    );
  });
});

describe("POST /api/asset-types/[id]/merge", () => {
  it("401 / 403 guard", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await mergeType(jreq("http://x", { targetId: "t2" }), { params: params("t1") })).status).toBe(401);
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    expect((await mergeType(jreq("http://x", { targetId: "t2" }), { params: params("t1") })).status).toBe(403);
  });
  it("400 when targetId missing or equals source", async () => {
    mockAuth.mockResolvedValue(session() as never);
    expect((await mergeType(jreq("http://x", {}), { params: params("t1") })).status).toBe(400);
    expect((await mergeType(jreq("http://x", { targetId: "t1" }), { params: params("t1") })).status).toBe(400);
  });
  it("400 unknownReference when the target type from the body is missing", async () => {
    mockAuth.mockResolvedValue(session() as never);
    vi.mocked(prisma.assetType.findUnique).mockResolvedValueOnce({ id: "t1", name: "A" } as never).mockResolvedValueOnce(null as never);
    const res = await mergeType(jreq("http://x", { targetId: "t2" }), { params: params("t1") });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("unknownReference");
  });
  it("moves assets, deletes source, and audits the merge", async () => {
    mockAuth.mockResolvedValue(session() as never);
    vi.mocked(prisma.assetType.findUnique).mockResolvedValueOnce({ id: "t1", name: "A" } as never).mockResolvedValueOnce({ id: "t2", name: "B" } as never);
    vi.mocked(prisma.$transaction).mockResolvedValue({ assetsMoved: 4, stockItemsMoved: 2, modelsMoved: 1, modelsFolded: 0 } as never);
    const res = await mergeType(jreq("http://x", { targetId: "t2" }), { params: params("t1") });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, assetsMoved: 4, stockItemsMoved: 2, modelsMoved: 1, modelsFolded: 0 });
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "DELETE", entityType: "AssetType", entityId: "t1" })
    );
  });
  it("moves the source type's models before deleting it", async () => {
    mockAuth.mockResolvedValue(session() as never);
    vi.mocked(prisma.assetType.findUnique).mockResolvedValueOnce({ id: "t1", name: "A" } as never).mockResolvedValueOnce({ id: "t2", name: "B" } as never);
    const order: string[] = [];
    const tx = {
      asset: { updateMany: vi.fn().mockResolvedValue({ count: 4 }) },
      stockItem: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
      maintenancePreset: { deleteMany: vi.fn() },
      assetType: { delete: vi.fn(async () => order.push("delete")) },
    };
    vi.mocked(reassignModels).mockImplementation(async () => {
      order.push("models");
      return { modelsMoved: 3, modelsFolded: 1 };
    });
    vi.mocked(prisma.$transaction).mockImplementation(((cb: (t: typeof tx) => unknown) => cb(tx)) as never);

    const res = await mergeType(jreq("http://x", { targetId: "t2" }), { params: params("t1") });
    expect(res.status).toBe(200);
    expect(reassignModels).toHaveBeenCalledWith(tx, { typeId: "t1" }, { typeId: "t2" });
    expect(order).toEqual(["models", "delete"]);
  });
});

describe("POST /api/asset-types/[id]/presets", () => {
  it("401 / 403 guard", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await createPreset(jreq("http://x", { name: "P" }), { params: params("t1") })).status).toBe(401);
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    expect((await createPreset(jreq("http://x", { name: "P" }), { params: params("t1") })).status).toBe(403);
  });
  it("400 on invalid body", async () => {
    mockAuth.mockResolvedValue(session() as never);
    vi.mocked(prisma.assetType.findUnique).mockResolvedValue({ id: "t1", name: "T" } as never);
    expect((await createPreset(jreq("http://x", { name: "" }), { params: params("t1") })).status).toBe(400);
  });
  it("404 when asset type missing", async () => {
    mockAuth.mockResolvedValue(session() as never);
    vi.mocked(prisma.assetType.findUnique).mockResolvedValue(null as never);
    expect((await createPreset(jreq("http://x", { name: "P" }), { params: params("t1") })).status).toBe(404);
  });
  it("creates a preset and audits CREATE", async () => {
    mockAuth.mockResolvedValue(session() as never);
    vi.mocked(prisma.assetType.findUnique).mockResolvedValue({ id: "t1", name: "T" } as never);
    vi.mocked(prisma.maintenancePreset.create).mockResolvedValue({ id: "p1", name: "P" } as never);
    const res = await createPreset(jreq("http://x", { name: "P" }), { params: params("t1") });
    expect(res.status).toBe(201);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CREATE", entityType: "MaintenancePreset", entityId: "p1" })
    );
  });
});

describe("PUT/DELETE /api/asset-types/presets/[id]", () => {
  it("PUT updates and audits", async () => {
    mockAuth.mockResolvedValue(session() as never);
    vi.mocked(prisma.maintenancePreset.findUnique).mockResolvedValue({ id: "p1", name: "P" } as never);
    vi.mocked(prisma.maintenancePreset.update).mockResolvedValue({ id: "p1", name: "P2" } as never);
    const res = await updatePreset(jreq("http://x", { name: "P2" }, "PUT"), { params: params("p1") });
    expect(res.status).toBe(200);
    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "UPDATE", entityType: "MaintenancePreset" }));
  });
  it("PUT 403 for non-admin", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    expect((await updatePreset(jreq("http://x", { name: "P2" }, "PUT"), { params: params("p1") })).status).toBe(403);
  });
  it("DELETE 404 when preset missing", async () => {
    mockAuth.mockResolvedValue(session() as never);
    vi.mocked(prisma.maintenancePreset.findUnique).mockResolvedValue(null as never);
    expect((await deletePreset(jreq("http://x", undefined, "DELETE"), { params: params("p1") })).status).toBe(404);
  });
  it("DELETE removes and audits", async () => {
    mockAuth.mockResolvedValue(session() as never);
    vi.mocked(prisma.maintenancePreset.findUnique).mockResolvedValue({ id: "p1", name: "P" } as never);
    vi.mocked(prisma.maintenancePreset.delete).mockResolvedValue({ id: "p1" } as never);
    const res = await deletePreset(jreq("http://x", undefined, "DELETE"), { params: params("p1") });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "DELETE", entityType: "MaintenancePreset", entityId: "p1" }));
  });
});
