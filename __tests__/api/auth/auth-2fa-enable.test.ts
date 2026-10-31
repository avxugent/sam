import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
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
