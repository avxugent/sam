import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  prisma: {
    appSetting: { findMany: vi.fn(), upsert: vi.fn() },
  },
}));
vi.mock("@/lib/auth", () => ({ __esModule: true, auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ __esModule: true, logAudit: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { GET, PUT } from "@/app/api/settings/compliance/route";
import { NextRequest } from "next/server";

const mockAuth = vi.mocked(auth);
const mockFindMany = vi.mocked(prisma.appSetting.findMany);
const mockUpsert = vi.mocked(prisma.appSetting.upsert);
const mockLogAudit = vi.mocked(logAudit);

function session(role: string) {
  return { user: { id: "u1", email: "a@b.c", role } } as never;
}

function putReq(body: unknown) {
  return new NextRequest("http://localhost/api/settings/compliance", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFindMany.mockResolvedValue([] as never);
  mockUpsert.mockResolvedValue({} as never);
});

describe("GET /api/settings/compliance", () => {
  it("returns 401 unauthenticated / 403 non-admin", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await GET()).status).toBe(401);
    mockAuth.mockResolvedValue(session("VIEWER"));
    expect((await GET()).status).toBe(403);
  });

  it("returns defaults when no settings stored", async () => {
    mockAuth.mockResolvedValue(session("ADMIN"));
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      requireTwoFactor: false,
      auditRetentionDays: 730,
      defaultOwnerId: null,
      reviewWorkLogItemId: null,
      reviewPeriodMonths: 12,
      firmwareMaxAgeDays: 90,
    });
  });

  it("maps stored values", async () => {
    mockAuth.mockResolvedValue(session("ADMIN"));
    mockFindMany.mockResolvedValue([
      { key: "security.requireTwoFactor", value: "true" },
      { key: "audit.retentionDays", value: "365" },
      { key: "assets.defaultOwnerId", value: "u42" },
    ] as never);
    const body = await (await GET()).json();
    expect(body.requireTwoFactor).toBe(true);
    expect(body.auditRetentionDays).toBe(365);
    expect(body.defaultOwnerId).toBe("u42");
  });
});

describe("PUT /api/settings/compliance", () => {
  it("returns 401/403 without proper role", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await PUT(putReq({}))).status).toBe(401);
    mockAuth.mockResolvedValue(session("EDITOR"));
    expect((await PUT(putReq({}))).status).toBe(403);
  });

  it("rejects out-of-range retention with 400", async () => {
    mockAuth.mockResolvedValue(session("ADMIN"));
    expect((await PUT(putReq({ auditRetentionDays: 10 }))).status).toBe(400);
    expect((await PUT(putReq({ auditRetentionDays: 5000 }))).status).toBe(400);
    expect((await PUT(putReq({ reviewPeriodMonths: 0 }))).status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("upserts provided keys only and logs an UPDATE audit entry", async () => {
    mockAuth.mockResolvedValue(session("ADMIN"));
    const res = await PUT(putReq({ requireTwoFactor: true, auditRetentionDays: 365 }));
    expect(res.status).toBe(200);

    expect(mockUpsert).toHaveBeenCalledTimes(2);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: "security.requireTwoFactor" }, update: { value: "true" } })
    );
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: "audit.retentionDays" }, update: { value: "365" } })
    );
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "UPDATE", entityType: "Setting" })
    );
  });

  it("stores empty string when defaultOwnerId is cleared (null)", async () => {
    mockAuth.mockResolvedValue(session("ADMIN"));
    const res = await PUT(putReq({ defaultOwnerId: null }));
    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: "assets.defaultOwnerId" }, update: { value: "" } })
    );
  });
});
