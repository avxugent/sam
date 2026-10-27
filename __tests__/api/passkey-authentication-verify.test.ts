import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: { passkey: { findUnique: vi.fn(), update: vi.fn() } },
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(), signIn: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/two-factor/remember-device", () => ({ setRememberMeCookie: vi.fn() }));
vi.mock("@/lib/two-factor/webauthn", () => ({
  verifyAuthentication: vi.fn(),
  readChallengeCookie: vi.fn(),
  clearChallengeCookie: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { auth, signIn } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { setRememberMeCookie } from "@/lib/two-factor/remember-device";
import { verifyAuthentication, readChallengeCookie, clearChallengeCookie } from "@/lib/two-factor/webauthn";
import { POST } from "@/app/api/auth/passkey/authentication-verify/route";

const mockAuth = vi.mocked(auth);
const mockSignIn = vi.mocked(signIn);
const mockFindUnique = vi.mocked(prisma.passkey.findUnique);
const mockUpdate = vi.mocked(prisma.passkey.update);
const mockLogAudit = vi.mocked(logAudit);
const mockRateLimit = vi.mocked(checkRateLimit);
const mockSetRememberMe = vi.mocked(setRememberMeCookie);
const mockVerify = vi.mocked(verifyAuthentication);
const mockReadChallenge = vi.mocked(readChallengeCookie);
const mockClearChallenge = vi.mocked(clearChallengeCookie);

function req(body?: object) {
  return new NextRequest("http://localhost/api/auth/passkey/authentication-verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function pendingSession() {
  return { user: { id: "u1", email: "a@b.com", role: "EDITOR" }, needs2FA: true } as never;
}

const STORED_PASSKEY = { id: "pk1", userId: "u1", credentialId: "cred1", publicKey: "pk", counter: 3, transports: null };

beforeEach(() => {
  vi.clearAllMocks();
  mockRateLimit.mockReturnValue({ allowed: true, retryAfterMs: 0 });
  mockReadChallenge.mockResolvedValue("the-challenge");
  mockFindUnique.mockResolvedValue(STORED_PASSKEY as never);
  mockUpdate.mockResolvedValue({} as never);
});

describe("POST /api/auth/passkey/authentication-verify", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await POST(req({ response: { id: "cred1" } }));
    expect(res.status).toBe(401);
  });

  it("no-ops with 200 when already fully authenticated", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    const res = await POST(req({ response: { id: "cred1" } }));
    expect(res.status).toBe(200);
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("returns 429 when rate-limited and logs LOGIN_FAILED", async () => {
    mockAuth.mockResolvedValue(pendingSession());
    mockRateLimit.mockReturnValue({ allowed: false, retryAfterMs: 60000 });
    const res = await POST(req({ response: { id: "cred1" } }));
    expect(res.status).toBe(429);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { stage: "passkey", reason: "rate_limited" } })
    );
  });

  it("returns 400 for an invalid body", async () => {
    mockAuth.mockResolvedValue(pendingSession());
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 and clears the cookie when the challenge is missing/expired", async () => {
    mockAuth.mockResolvedValue(pendingSession());
    mockReadChallenge.mockResolvedValue(null);
    const res = await POST(req({ response: { id: "cred1" } }));
    expect(res.status).toBe(400);
    expect(mockClearChallenge).toHaveBeenCalled();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("returns 400 when the credential is not found", async () => {
    mockAuth.mockResolvedValue(pendingSession());
    mockFindUnique.mockResolvedValue(null);
    const res = await POST(req({ response: { id: "unknown-cred" } }));
    expect(res.status).toBe(400);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { stage: "passkey", reason: "unknown_credential" } })
    );
  });

  it("returns 400 when the credential belongs to a different user", async () => {
    mockAuth.mockResolvedValue(pendingSession());
    mockFindUnique.mockResolvedValue({ ...STORED_PASSKEY, userId: "someone-else" } as never);
    const res = await POST(req({ response: { id: "cred1" } }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when verification fails and does not sign in", async () => {
    mockAuth.mockResolvedValue(pendingSession());
    mockVerify.mockResolvedValue({ verified: false, newCounter: 0 });
    const res = await POST(req({ response: { id: "cred1" } }));
    expect(res.status).toBe(400);
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { stage: "passkey", reason: "invalid_signature" } })
    );
  });

  it("on success: bumps the counter, signs in via credentials-2fa-verified, and clears the challenge", async () => {
    mockAuth.mockResolvedValue(pendingSession());
    mockVerify.mockResolvedValue({ verified: true, newCounter: 9 });

    const res = await POST(req({ response: { id: "cred1" } }));
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "pk1" },
      data: expect.objectContaining({ counter: 9 }),
    });
    expect(mockSignIn).toHaveBeenCalledWith("credentials-2fa-verified", {
      userId: "u1",
      method: "passkey",
      redirect: false,
    });
    expect(mockClearChallenge).toHaveBeenCalled();
    expect(mockSetRememberMe).not.toHaveBeenCalled();
  });

  it("sets the remember-me cookie only when rememberMe is true", async () => {
    mockAuth.mockResolvedValue(pendingSession());
    mockVerify.mockResolvedValue({ verified: true, newCounter: 9 });

    await POST(req({ response: { id: "cred1" }, rememberMe: true }));
    expect(mockSetRememberMe).toHaveBeenCalledWith(expect.anything(), "u1");
  });
});
