import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => {
  // One mock for both reads: auth() and the login-step routes' authIncludingPendingSteps().
  const read = vi.fn();
  return { auth: read, authIncludingPendingSteps: read };
});
vi.mock("@/lib/two-factor/session-upgrade", () => ({ upgradeSession: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/two-factor/totp", () => ({ verifyTotpCode: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { upgradeSession } from "@/lib/two-factor/session-upgrade";
import { logAudit } from "@/lib/audit";
import { verifyTotpCode } from "@/lib/two-factor/totp";
import { POST as enable2fa } from "@/app/api/auth/2fa/enable/route";

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
  vi.mocked(upgradeSession).mockResolvedValue(true);
  vi.mocked(prisma.user.update).mockResolvedValue({ id: "u1", email: "t@test.com" } as never);
});

describe("audit — 2FA enable", () => {
  it("logs UPDATE on User with '2FA enabled'", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ provider: "credentials", totpSecret: "S", totpEnabled: false } as never);
    mockVerify.mockReturnValue(true);

    const res = await enable2fa(req("http://localhost/api/auth/2fa/enable", { code: "123456" }));
    expect(res.status).toBe(200);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "UPDATE", entityType: "User", entityId: "u1", detail: { event: "2FA enabled" } })
    );
  });

  it("does not log on invalid code", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ provider: "credentials", totpSecret: "S", totpEnabled: false } as never);
    mockVerify.mockReturnValue(false);

    const res = await enable2fa(req("http://localhost/api/auth/2fa/enable", { code: "000000" }));
    expect(res.status).toBe(400);
    expect(mockLogAudit).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/2fa/enable — guards", () => {
  const enable = () => enable2fa(req("http://localhost/api/auth/2fa/enable", { code: "123456" }));
  const pendingUser = { provider: "credentials", totpSecret: "S", totpEnabled: false };

  it("401 without a session", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await enable()).status).toBe(401);
  });

  it("403 when the session still owes a step other than 2FA setup", async () => {
    mockAuth.mockResolvedValue({ ...session("EDITOR"), needsPasswordChange: true } as never);
    expect((await enable()).status).toBe(403);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it.each([
    ["an SSO account", { ...pendingUser, provider: "microsoft-entra-id" }],
    ["no pending secret", { ...pendingUser, totpSecret: null }],
    ["2FA already enabled", { ...pendingUser, totpEnabled: true }],
  ])("400 for %s", async (_label, user) => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(user as never);
    expect((await enable()).status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("upgrades a forced-setup session, and 401s when the upgrade fails", async () => {
    mockAuth.mockResolvedValue({ ...session("EDITOR"), needs2FASetup: true } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(pendingUser as never);
    mockVerify.mockReturnValue(true);
    expect((await enable()).status).toBe(200);
    expect(upgradeSession).toHaveBeenCalledWith("u1", "totp");

    vi.mocked(upgradeSession).mockResolvedValue(false);
    expect((await enable()).status).toBe(401);
  });
});
