import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), count: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn(), signIn: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/totp", () => ({ verifyTotpCode: vi.fn() }));
vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn(), hash: vi.fn() },
  compare: vi.fn(),
  hash: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { verifyTotpCode } from "@/lib/totp";
import bcrypt from "bcryptjs";
import { POST as enable2fa } from "@/app/api/auth/2fa/enable/route";
import { POST as disable2fa } from "@/app/api/auth/2fa/disable/route";
import { PATCH as patchMe } from "@/app/api/users/me/route";
import { POST as setup } from "@/app/api/setup/route";

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

describe("audit — users/me password change", () => {
  it("logs UPDATE on User for password change", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ passwordHash: "old", provider: "credentials" } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(bcrypt.hash).mockResolvedValue("newhash" as never);

    const res = await patchMe(
      req("http://localhost/api/users/me", { currentPassword: "old", newPassword: "newpass12", confirmPassword: "newpass12" }, "PATCH")
    );
    expect(res.status).toBe(200);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "UPDATE", entityType: "User", detail: expect.objectContaining({ event: expect.stringContaining("Password changed") }) })
    );
  });

  it("does NOT log for preference-only change (theme)", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ passwordHash: "old", provider: "credentials" } as never);

    const res = await patchMe(req("http://localhost/api/users/me", { theme: "dark" }, "PATCH"));
    expect(res.status).toBe(200);
    expect(mockLogAudit).not.toHaveBeenCalled();
  });
});

describe("audit — initial setup", () => {
  it("logs CREATE on User for first admin", async () => {
    vi.mocked(prisma.user.count).mockResolvedValue(0 as never);
    vi.mocked(bcrypt.hash).mockResolvedValue("hash" as never);
    vi.mocked(prisma.user.create).mockResolvedValue({ id: "admin1", email: "admin@test.com" } as never);

    const res = await setup(req("http://localhost/api/setup", { name: "Admin", email: "admin@test.com", password: "password1" }));
    expect(res.status).toBe(200);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CREATE", entityType: "User", entityId: "admin1", entityName: "admin@test.com" })
    );
  });

  it("does not log when setup already completed", async () => {
    vi.mocked(prisma.user.count).mockResolvedValue(1 as never);
    const res = await setup(req("http://localhost/api/setup", { name: "X", email: "x@test.com", password: "password1" }));
    expect(res.status).toBe(403);
    expect(mockLogAudit).not.toHaveBeenCalled();
  });
});
