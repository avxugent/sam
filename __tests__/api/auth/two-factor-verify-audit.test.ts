import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  prisma: {
    user: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/auth", () => {
  // One mock for both reads: auth() and the login-step routes' authIncludingPendingSteps().
  const read = vi.fn();
  return { auth: read, authIncludingPendingSteps: read };
});
vi.mock("@/lib/two-factor/session-upgrade", () => ({ upgradeSession: vi.fn() }));
vi.mock("@/lib/audit", () => ({ __esModule: true, logAudit: vi.fn() }));
vi.mock("@/lib/two-factor/totp", () => ({ __esModule: true, verifyTotpCode: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ __esModule: true, consumeRateLimit: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: () => undefined })) }));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { upgradeSession } from "@/lib/two-factor/session-upgrade";
import { logAudit } from "@/lib/audit";
import { verifyTotpCode } from "@/lib/two-factor/totp";
import { consumeRateLimit } from "@/lib/rate-limit";
import { POST } from "@/app/api/auth/2fa/verify/route";
import { NextRequest } from "next/server";

const mockAuth = vi.mocked(auth);
const mockFindUnique = vi.mocked(prisma.user.findUnique);
const mockLogAudit = vi.mocked(logAudit);
const mockVerify = vi.mocked(verifyTotpCode);
const mockRateLimit = vi.mocked(consumeRateLimit);

function pendingSession() {
  return { user: { id: "u1", email: "a@b.c", role: "EDITOR" }, needs2FA: true } as never;
}

function req(code = "123456") {
  return new NextRequest("http://localhost/api/auth/2fa/verify", {
    method: "POST",
    body: JSON.stringify({ code }),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(upgradeSession).mockResolvedValue(true);
  mockRateLimit.mockReturnValue({ allowed: true, retryAfterMs: 0 });
  mockFindUnique.mockResolvedValue({ totpSecret: "SECRET", totpEnabled: true } as never);
});

describe("POST /api/auth/2fa/verify — audit logging", () => {
  it("403 for a session that still owes a password change before its 2FA step", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", email: "a@b.c", role: "EDITOR" }, needs2FA: true, needsPasswordChange: true } as never);
    const res = await POST(req());
    expect(res.status).toBe(403);
    expect(mockVerify).not.toHaveBeenCalled();
    expect(upgradeSession).not.toHaveBeenCalled();
  });

  it("logs LOGIN_FAILED (stage totp) on an invalid code", async () => {
    mockAuth.mockResolvedValue(pendingSession());
    mockVerify.mockReturnValue(false);

    const res = await POST(req());
    expect(res.status).toBe(400);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "LOGIN_FAILED",
        entityType: "Auth",
        detail: { stage: "totp", reason: "invalid_code" },
      })
    );
  });

  it("logs LOGIN_FAILED (rate_limited) when TOTP attempts are throttled", async () => {
    mockAuth.mockResolvedValue(pendingSession());
    mockRateLimit.mockReturnValue({ allowed: false, retryAfterMs: 60000 });

    const res = await POST(req());
    expect(res.status).toBe(429);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "LOGIN_FAILED",
        detail: { stage: "totp", reason: "rate_limited" },
      })
    );
  });

  it("does not log LOGIN_FAILED on a valid code (success is logged via events.signIn)", async () => {
    mockAuth.mockResolvedValue(pendingSession());
    mockVerify.mockReturnValue(true);

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(mockLogAudit).not.toHaveBeenCalled();
  });

  it("401 when the session upgrade is refused (e.g. the account changed since login)", async () => {
    mockAuth.mockResolvedValue(pendingSession());
    mockVerify.mockReturnValue(true);
    vi.mocked(upgradeSession).mockResolvedValue(false);

    const res = await POST(req());
    expect(res.status).toBe(401);
  });
});
