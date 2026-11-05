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
import { POST } from "@/app/api/assets/bulk-decommission/route";

const mockAuth = vi.mocked(auth);
const mockFindUnique = vi.mocked(prisma.asset.findUnique);
const mockUpdate = vi.mocked(prisma.asset.update);
const mockLogAudit = vi.mocked(logAudit);

function session(role: "ADMIN" | "EDITOR" | "VIEWER") {
  return { user: { id: "u1", role, name: "T", email: "t@test.com" } };
}

function makeReq(body?: object) {
  return new NextRequest("http://localhost/api/assets/bulk-decommission", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const ASSET = {
  model: "Dell Latitude",
  status: "INSTALLED",
  location: { name: "Room 101", fiNumber: "14.10.100.013" },
};

beforeEach(() => vi.clearAllMocks());

describe("POST /api/assets/bulk-decommission", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await POST(makeReq({ ids: ["a1"], disposalMethod: "WIPED" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for viewers", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    const res = await POST(makeReq({ ids: ["a1"], disposalMethod: "WIPED" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for an empty ids array", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    const res = await POST(makeReq({ ids: [], disposalMethod: "WIPED" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid disposalMethod", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    const res = await POST(makeReq({ ids: ["a1"], disposalMethod: "NONSENSE" }));
    expect(res.status).toBe(400);
  });

  it("skips a not-found asset and a not-decommissionable one, decommissions the rest, and audits only successes", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockFindUnique.mockImplementation((async ({ where: { id } }: { where: { id: string } }) => {
      if (id === "missing") return null;
      if (id === "already-done") return { ...ASSET, id, status: "DECOMMISSIONED" };
      return { ...ASSET, id };
    }) as never);
    mockUpdate.mockResolvedValue({} as never);

    const res = await POST(
      makeReq({ ids: ["ok-1", "missing", "already-done"], disposalMethod: "WIPED", note: "cleanup" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.succeeded).toEqual(["ok-1"]);
    expect(body.failed).toEqual(
      expect.arrayContaining([
        { id: "missing", reason: "NOT_FOUND" },
        { id: "already-done", reason: "ALREADY_DECOMMISSIONED" },
      ])
    );
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockLogAudit).toHaveBeenCalledTimes(1);
    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({ entityId: "ok-1" }));
  });
});
