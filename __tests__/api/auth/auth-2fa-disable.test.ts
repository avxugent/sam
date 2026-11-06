import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/two-factor/totp", () => ({ verifyTotpCode: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { verifyTotpCode } from "@/lib/two-factor/totp";
import { POST as disable2fa } from "@/app/api/auth/2fa/disable/route";

const mockAuth = vi.mocked(auth);
const mockLogAudit = vi.mocked(logAudit);
const mockVerify = vi.mocked(verifyTotpCode);

function session(role: "ADMIN" | "EDITOR" | "VIEWER" = "ADMIN", id = "u1", email = "t@test.com") {
  return { user: { id, role, name: "T", email } };
}

function req(url: string, body?: object, method = "POST") {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : "{}",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.user.update).mockResolvedValue({ id: "u1", email: "t@test.com" } as never);
});

describe("audit — 2FA disable", () => {
  it("logs UPDATE on self with '2FA disabled', no adminOverride", async () => {
    mockAuth.mockResolvedValue(session("EDITOR", "u1") as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ provider: "credentials", totpEnabled: true, totpSecret: "S", email: "t@test.com" } as never);
    mockVerify.mockReturnValue(true);

    const res = await disable2fa(req("http://localhost/api/auth/2fa/disable", { code: "123456" }));
    expect(res.status).toBe(200);
    const call = mockLogAudit.mock.calls[0][0];
    expect(call).toMatchObject({ action: "UPDATE", entityType: "User", entityId: "u1", detail: { event: "2FA disabled" } });
    expect(call.detail).not.toHaveProperty("adminOverride");
  });

  it("logs adminOverride when admin disables another user's 2FA", async () => {
    mockAuth.mockResolvedValue(session("ADMIN", "admin1") as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ provider: "credentials", totpEnabled: true, totpSecret: "S", email: "victim@test.com" } as never);

    const res = await disable2fa(req("http://localhost/api/auth/2fa/disable", { userId: "u2" }));
    expect(res.status).toBe(200);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "UPDATE",
        entityType: "User",
        entityId: "u2",
        entityName: "victim@test.com",
        detail: expect.objectContaining({ event: "2FA disabled", adminOverride: true }),
      })
    );
  });
});

describe("POST /api/auth/2fa/disable — guards", () => {
  const enabledUser = { provider: "credentials", totpEnabled: true, totpSecret: "S", email: "t@test.com" };
  const disable = (body: object) => disable2fa(req("http://localhost/api/auth/2fa/disable", body));

  it("401 without a session", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await disable({ code: "123456" })).status).toBe(401);
  });

  it("403 when a non-admin disables another user's 2FA", async () => {
    mockAuth.mockResolvedValue(session("EDITOR", "u1") as never);
    const res = await disable({ userId: "u2" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("400 unknownReference when the body names no user", async () => {
    mockAuth.mockResolvedValue(session("ADMIN", "admin1") as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);
    const res = await disable({ userId: "gone" });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("unknownReference");
  });

  it("400 for an over-long userId", async () => {
    mockAuth.mockResolvedValue(session("ADMIN", "admin1") as never);
    expect((await disable({ userId: "x".repeat(65) })).status).toBe(400);
  });

  it.each([
    ["without a code", {}, true],
    ["with a wrong code", { code: "000000" }, false],
  ])("400 for self-disable %s", async (_label, body, verifies) => {
    mockAuth.mockResolvedValue(session("EDITOR", "u1") as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(enabledUser as never);
    mockVerify.mockReturnValue(verifies);
    expect((await disable(body)).status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("400 when 2FA is not enabled", async () => {
    mockAuth.mockResolvedValue(session("ADMIN", "admin1") as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...enabledUser, totpEnabled: false } as never);
    expect((await disable({ userId: "u2" })).status).toBe(400);
  });
});
