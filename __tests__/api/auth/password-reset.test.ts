import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    passwordResetToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/email", () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, retryAfterMs: 0 }),
}));

vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn().mockResolvedValue("$2b$13$hashed") },
}));

import { prisma } from "@/lib/prisma";
import { POST as requestReset } from "@/app/api/auth/password-reset/request/route";
import { GET as validateToken } from "@/app/api/auth/password-reset/validate/route";
import { POST as confirmReset } from "@/app/api/auth/password-reset/confirm/route";

const mockUserFindUnique = vi.mocked(prisma.user.findUnique);
const mockTokenCreate = vi.mocked(prisma.passwordResetToken.create);
const mockTokenFindUnique = vi.mocked(prisma.passwordResetToken.findUnique);
const mockTransaction = vi.mocked(prisma.$transaction);

function makePostRequest(url: string, body: object) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── POST /api/auth/password-reset/request ─────────────────────────────────────

describe("POST /api/auth/password-reset/request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTokenCreate.mockResolvedValue({} as never);
  });

  it("always returns 200 (no user enumeration)", async () => {
    mockUserFindUnique.mockResolvedValue(null);
    const res = await requestReset(
      makePostRequest("http://localhost/api/auth/password-reset/request", {
        email: "nobody@example.com",
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockTokenCreate).not.toHaveBeenCalled();
  });

  it("creates a token and sends email for a credentials user", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "user-1",
      provider: "credentials",
    } as never);

    const res = await requestReset(
      makePostRequest("http://localhost/api/auth/password-reset/request", {
        email: "user@example.com",
      })
    );
    expect(res.status).toBe(200);
    expect(mockTokenCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user-1" }),
      })
    );
  });

  it("does not create a token for an SSO user", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "sso-1",
      provider: "microsoft-entra-id",
    } as never);

    const res = await requestReset(
      makePostRequest("http://localhost/api/auth/password-reset/request", {
        email: "sso@example.com",
      })
    );
    expect(res.status).toBe(200);
    expect(mockTokenCreate).not.toHaveBeenCalled();
  });

  it("returns 200 for invalid email (no enumeration)", async () => {
    const res = await requestReset(
      makePostRequest("http://localhost/api/auth/password-reset/request", {
        email: "not-an-email",
      })
    );
    expect(res.status).toBe(200);
  });
});

// ── GET /api/auth/password-reset/validate ─────────────────────────────────────

describe("GET /api/auth/password-reset/validate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns valid=false when no token param", async () => {
    const req = new NextRequest("http://localhost/api/auth/password-reset/validate");
    const res = await validateToken(req);
    const body = await res.json();
    expect(body.valid).toBe(false);
  });

  it("returns valid=false when token not found", async () => {
    mockTokenFindUnique.mockResolvedValue(null);
    const req = new NextRequest(
      "http://localhost/api/auth/password-reset/validate?token=deadbeef"
    );
    const res = await validateToken(req);
    const body = await res.json();
    expect(body.valid).toBe(false);
  });

  it("returns valid=false when token is used", async () => {
    mockTokenFindUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60000),
      usedAt: new Date(),
    } as never);
    const req = new NextRequest(
      "http://localhost/api/auth/password-reset/validate?token=deadbeef"
    );
    const res = await validateToken(req);
    const body = await res.json();
    expect(body.valid).toBe(false);
  });

  it("returns valid=false when token is expired", async () => {
    mockTokenFindUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() - 1000),
      usedAt: null,
    } as never);
    const req = new NextRequest(
      "http://localhost/api/auth/password-reset/validate?token=deadbeef"
    );
    const res = await validateToken(req);
    const body = await res.json();
    expect(body.valid).toBe(false);
  });

  it("returns valid=true for a fresh unused token", async () => {
    mockTokenFindUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60000),
      usedAt: null,
    } as never);
    const req = new NextRequest(
      "http://localhost/api/auth/password-reset/validate?token=goodtoken"
    );
    const res = await validateToken(req);
    const body = await res.json();
    expect(body.valid).toBe(true);
  });
});

// ── POST /api/auth/password-reset/confirm ─────────────────────────────────────

describe("POST /api/auth/password-reset/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockImplementation(async (fn) => fn({
      passwordResetToken: { update: vi.fn() },
      user: { update: vi.fn() },
    } as never));
  });

  function makeConfirmRequest(body: object) {
    return makePostRequest("http://localhost/api/auth/password-reset/confirm", body);
  }

  it("returns 400 for mismatched passwords", async () => {
    const res = await confirmReset(makeConfirmRequest({
      token: "tok",
      password: "newpassword1",
      confirmPassword: "different",
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when token is not found", async () => {
    mockTokenFindUnique.mockResolvedValue(null);
    const res = await confirmReset(makeConfirmRequest({
      token: "badtoken",
      password: "newpassword1",
      confirmPassword: "newpassword1",
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when token is already used", async () => {
    mockTokenFindUnique.mockResolvedValue({
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 60000),
      user: { id: "u1", provider: "credentials" },
    } as never);
    const res = await confirmReset(makeConfirmRequest({
      token: "usedtoken",
      password: "newpassword1",
      confirmPassword: "newpassword1",
    }));
    expect(res.status).toBe(400);
  });

  it("resets the password and returns ok", async () => {
    mockTokenFindUnique.mockResolvedValue({
      usedAt: null,
      expiresAt: new Date(Date.now() + 60000),
      user: { id: "u1", provider: "credentials" },
    } as never);

    const res = await confirmReset(makeConfirmRequest({
      token: "validtoken",
      password: "newpassword1",
      confirmPassword: "newpassword1",
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockTransaction).toHaveBeenCalled();
  });
});
