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
import { logAudit } from "@/lib/audit";
import { POST as sendForRepair } from "@/app/api/assets/[id]/send-for-repair/route";

const mockAuth = vi.mocked(auth);
const mockFindUnique = vi.mocked(prisma.asset.findUnique);
const mockUpdate = vi.mocked(prisma.asset.update);
const mockLogAudit = vi.mocked(logAudit);

function session(role: "ADMIN" | "EDITOR" | "VIEWER") {
  return { user: { id: "u1", role, name: "T", email: "t@test.com" } };
}

function req(body?: object) {
  return new NextRequest("http://localhost/api/assets/asset-1/send-for-repair", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : "{}",
  });
}

const PARAMS = Promise.resolve({ id: "asset-1" });
const INSTALLED_ASSET = { id: "asset-1", model: "Dell Monitor", status: "INSTALLED", lineageId: "lin-1" };
const DECOMMISSIONED_ASSET = { id: "asset-1", model: "Dell Monitor", status: "DECOMMISSIONED", lineageId: "lin-1" };
const IN_REPAIR_ASSET = { id: "asset-1", model: "Dell Monitor", status: "IN_REPAIR", lineageId: "lin-1" };

beforeEach(() => vi.clearAllMocks());

describe("POST /api/assets/[id]/send-for-repair", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await sendForRepair(req(), { params: PARAMS });
    expect(res.status).toBe(401);
  });

  it("returns 403 for viewers", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    const res = await sendForRepair(req(), { params: PARAMS });
    expect(res.status).toBe(403);
  });

  it("returns 404 if asset not found", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockFindUnique.mockResolvedValue(null as never);
    const res = await sendForRepair(req(), { params: PARAMS });
    expect(res.status).toBe(404);
  });

  it("returns 400 if already decommissioned", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockFindUnique.mockResolvedValue(DECOMMISSIONED_ASSET as never);
    const res = await sendForRepair(req(), { params: PARAMS });
    expect(res.status).toBe(400);
  });

  it("returns 400 if already in repair", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockFindUnique.mockResolvedValue(IN_REPAIR_ASSET as never);
    const res = await sendForRepair(req(), { params: PARAMS });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("ALREADY_IN_REPAIR");
  });

  it("rejects note longer than 500 chars", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockFindUnique.mockResolvedValue(INSTALLED_ASSET as never);
    const res = await sendForRepair(req({ note: "x".repeat(501) }), { params: PARAMS });
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("sends an installed asset for repair, storing the actor and note, and threads lineageId to the audit log", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockFindUnique.mockResolvedValue(INSTALLED_ASSET as never);
    mockUpdate.mockResolvedValue({ ...INSTALLED_ASSET, status: "IN_REPAIR" } as never);

    const res = await sendForRepair(req({ note: "Sent to vendor" }), { params: PARAMS });

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "IN_REPAIR",
        repairNote: "Sent to vendor",
        sentForRepairById: "u1",
      }),
    }));
    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({
      entityType: "Asset",
      entityId: "asset-1",
      lineageId: "lin-1",
    }));
  });

  it("accepts a request with no note", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockFindUnique.mockResolvedValue(INSTALLED_ASSET as never);
    mockUpdate.mockResolvedValue({ ...INSTALLED_ASSET, status: "IN_REPAIR" } as never);
    const res = await sendForRepair(req(), { params: PARAMS });
    expect(res.status).toBe(200);
  });
});
