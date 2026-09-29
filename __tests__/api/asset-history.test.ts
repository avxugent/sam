import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    asset: { findUnique: vi.fn() },
    auditLog: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { GET as getHistory } from "@/app/api/assets/[id]/history/route";

const mockAuth = vi.mocked(auth);
const mockFindUnique = vi.mocked(prisma.asset.findUnique);
const mockFindMany = vi.mocked(prisma.auditLog.findMany);

function session(role: "ADMIN" | "EDITOR" | "VIEWER") {
  return { user: { id: "u1", role, name: "T", email: "t@test.com" } };
}

function req() {
  return new NextRequest("http://localhost/api/assets/asset-1/history");
}

const PARAMS = Promise.resolve({ id: "asset-1" });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/assets/[id]/history", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await getHistory(req(), { params: PARAMS });
    expect(res.status).toBe(401);
  });

  it("returns 404 if asset not found", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    mockFindUnique.mockResolvedValue(null as never);
    const res = await getHistory(req(), { params: PARAMS });
    expect(res.status).toBe(404);
  });

  it("is visible to VIEWER (scoped to this asset's own lineage, not the admin audit log)", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    mockFindUnique.mockResolvedValue({ lineageId: "lin-1" } as never);
    mockFindMany.mockResolvedValue([{ id: "log1" }] as never);
    const res = await getHistory(req(), { params: PARAMS });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([{ id: "log1" }]);
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { lineageId: "lin-1" },
      orderBy: { timestamp: "desc" },
    });
  });
});
