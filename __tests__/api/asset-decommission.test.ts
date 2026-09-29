import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    asset: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { POST as decommission } from "@/app/api/assets/[id]/decommission/route";
import { POST as reinstate } from "@/app/api/assets/[id]/reinstate/route";

const mockAuth = vi.mocked(auth);
const mockFindUnique = vi.mocked(prisma.asset.findUnique);
const mockUpdate = vi.mocked(prisma.asset.update);

function session(role: "ADMIN" | "EDITOR" | "VIEWER") {
  return { user: { id: "u1", role, name: "T", email: "t@test.com" } };
}

function decommissionReq(body?: object) {
  return new NextRequest("http://localhost/api/assets/asset-1/decommission", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : "{}",
  });
}

function reinstateReq() {
  return new NextRequest("http://localhost/api/assets/asset-1/reinstate", { method: "POST" });
}

const PARAMS = Promise.resolve({ id: "asset-1" });
const INSTALLED_ASSET = { id: "asset-1", model: "Dell Monitor", status: "INSTALLED", lineageId: "lin-1", location: { name: "Room 205", fiNumber: "14.10.100.205" } };
const DECOMMISSIONED_ASSET = { id: "asset-1", model: "Dell Monitor", status: "DECOMMISSIONED", lineageId: "lin-1", location: { name: "Room 205", fiNumber: null } };
const IN_REPAIR_ASSET = { id: "asset-1", model: "Dell Monitor", status: "IN_REPAIR", lineageId: "lin-1", location: { name: "Room 205", fiNumber: null } };

beforeEach(() => vi.clearAllMocks());

// ── POST /api/assets/[id]/decommission ────────────────────────────────────────

describe("POST /api/assets/[id]/decommission", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await decommission(decommissionReq(), { params: PARAMS });
    expect(res.status).toBe(401);
  });

  it("returns 403 for viewers", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    const res = await decommission(decommissionReq(), { params: PARAMS });
    expect(res.status).toBe(403);
  });

  it("returns 404 if asset not found", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockFindUnique.mockResolvedValue(null as never);
    const res = await decommission(decommissionReq(), { params: PARAMS });
    expect(res.status).toBe(404);
  });

  it("returns 400 if already decommissioned", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockFindUnique.mockResolvedValue(DECOMMISSIONED_ASSET as never);
    const res = await decommission(decommissionReq(), { params: PARAMS });
    expect(res.status).toBe(400);
  });

  it("returns 400 when disposalMethod is missing", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockFindUnique.mockResolvedValue(INSTALLED_ASSET as never);
    const res = await decommission(decommissionReq({ note: "no method" }), { params: PARAMS });
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 on an unknown disposalMethod", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockFindUnique.mockResolvedValue(INSTALLED_ASSET as never);
    const res = await decommission(decommissionReq({ disposalMethod: "SHREDDED" }), { params: PARAMS });
    expect(res.status).toBe(400);
  });

  it("decommissions an installed asset, storing disposal method and actor", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockFindUnique.mockResolvedValue(INSTALLED_ASSET as never);
    mockUpdate.mockResolvedValue({ ...INSTALLED_ASSET, status: "DECOMMISSIONED" } as never);
    const res = await decommission(decommissionReq({ disposalMethod: "WIPED" }), { params: PARAMS });
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "DECOMMISSIONED",
        disposalMethod: "WIPED",
        decommissionedById: "u1",
      }),
    }));
  });

  it("stores the decommission note", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockFindUnique.mockResolvedValue(INSTALLED_ASSET as never);
    mockUpdate.mockResolvedValue({ ...INSTALLED_ASSET, status: "DECOMMISSIONED", decommissionNote: "End of life" } as never);
    const res = await decommission(decommissionReq({ note: "End of life", disposalMethod: "DESTROYED" }), { params: PARAMS });
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ decommissionNote: "End of life" }),
    }));
  });

  it("rejects note longer than 500 chars", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    const res = await decommission(decommissionReq({ note: "x".repeat(501), disposalMethod: "WIPED" }), { params: PARAMS });
    expect(res.status).toBe(400);
  });
});

// ── POST /api/assets/[id]/reinstate ───────────────────────────────────────────

describe("POST /api/assets/[id]/reinstate", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await reinstate(reinstateReq(), { params: PARAMS });
    expect(res.status).toBe(401);
  });

  it("returns 403 for editors (admin only)", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    const res = await reinstate(reinstateReq(), { params: PARAMS });
    expect(res.status).toBe(403);
  });

  it("returns 403 for viewers", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    const res = await reinstate(reinstateReq(), { params: PARAMS });
    expect(res.status).toBe(403);
  });

  it("returns 404 if asset not found", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    mockFindUnique.mockResolvedValue(null as never);
    const res = await reinstate(reinstateReq(), { params: PARAMS });
    expect(res.status).toBe(404);
  });

  it("returns 400 if asset is not decommissioned", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    mockFindUnique.mockResolvedValue(INSTALLED_ASSET as never);
    const res = await reinstate(reinstateReq(), { params: PARAMS });
    expect(res.status).toBe(400);
  });

  it("returns 400 for an asset that is IN_REPAIR (reinstate is not a valid exit from repair)", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    mockFindUnique.mockResolvedValue(IN_REPAIR_ASSET as never);
    const res = await reinstate(reinstateReq(), { params: PARAMS });
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("reinstates a decommissioned asset", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    mockFindUnique.mockResolvedValue(DECOMMISSIONED_ASSET as never);
    mockUpdate.mockResolvedValue({ ...DECOMMISSIONED_ASSET, status: "INSTALLED" } as never);
    const res = await reinstate(reinstateReq(), { params: PARAMS });
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "INSTALLED",
        decommissionedAt: null,
        decommissionNote: null,
        disposalMethod: null,
        decommissionedById: null,
      }),
    }));
  });
});
