import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
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
  it("returns assets filtered by the type id", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    vi.mocked(prisma.asset.findMany).mockResolvedValue([{ id: "a1", model: "M" }] as never);
    const res = await listAssets(new Request("http://x"), { params: params("t1") });
    expect(res.status).toBe(200);
    expect(vi.mocked(prisma.asset.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({ where: { typeId: "t1" } })
    );
    expect(await res.json()).toEqual([{ id: "a1", model: "M" }]);
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
  it("404 when a type is missing", async () => {
    mockAuth.mockResolvedValue(session() as never);
    vi.mocked(prisma.assetType.findUnique).mockResolvedValueOnce({ id: "t1", name: "A" } as never).mockResolvedValueOnce(null as never);
    expect((await mergeType(jreq("http://x", { targetId: "t2" }), { params: params("t1") })).status).toBe(404);
  });
  it("moves assets, deletes source, and audits the merge", async () => {
    mockAuth.mockResolvedValue(session() as never);
    vi.mocked(prisma.assetType.findUnique).mockResolvedValueOnce({ id: "t1", name: "A" } as never).mockResolvedValueOnce({ id: "t2", name: "B" } as never);
    vi.mocked(prisma.$transaction).mockResolvedValue({ assetCount: 4, stockCount: 2 } as never);
    const res = await mergeType(jreq("http://x", { targetId: "t2" }), { params: params("t1") });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, assetCount: 4, stockCount: 2 });
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "DELETE", entityType: "AssetType", entityId: "t1" })
    );
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
    expect(res.status).toBe(204);
    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "DELETE", entityType: "MaintenancePreset", entityId: "p1" }));
  });
});
