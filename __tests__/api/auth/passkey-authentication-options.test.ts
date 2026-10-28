import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: { passkey: { findMany: vi.fn() } },
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: vi.fn() }));
vi.mock("@/lib/two-factor/webauthn", () => ({
  buildAuthenticationOptions: vi.fn(),
  setChallengeCookie: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { buildAuthenticationOptions, setChallengeCookie } from "@/lib/two-factor/webauthn";
import { POST } from "@/app/api/auth/passkey/authentication-options/route";

const mockAuth = vi.mocked(auth);
const mockFindMany = vi.mocked(prisma.passkey.findMany);
const mockRateLimit = vi.mocked(consumeRateLimit);
const mockBuildOptions = vi.mocked(buildAuthenticationOptions);
const mockSetChallenge = vi.mocked(setChallengeCookie);

function req() {
  return new NextRequest("http://localhost/api/auth/passkey/authentication-options", { method: "POST" });
}

function pendingSession() {
  return { user: { id: "u1", email: "a@b.com", role: "EDITOR" }, needs2FA: true } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRateLimit.mockReturnValue({ allowed: true, retryAfterMs: 0 });
  mockBuildOptions.mockResolvedValue({ challenge: "chal" } as never);
});

describe("POST /api/auth/passkey/authentication-options", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await POST(req());
    expect(res.status).toBe(401);
  });

  it("returns 400 when there is no pending 2FA challenge", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    const res = await POST(req());
    expect(res.status).toBe(400);
  });

  it("returns 429 when rate-limited", async () => {
    mockAuth.mockResolvedValue(pendingSession());
    mockRateLimit.mockReturnValue({ allowed: false, retryAfterMs: 60000 });
    const res = await POST(req());
    expect(res.status).toBe(429);
  });

  it("returns 400 when the user has no passkeys", async () => {
    mockAuth.mockResolvedValue(pendingSession());
    mockFindMany.mockResolvedValue([]);
    const res = await POST(req());
    expect(res.status).toBe(400);
  });

  it("returns options and sets the challenge cookie", async () => {
    mockAuth.mockResolvedValue(pendingSession());
    mockFindMany.mockResolvedValue([{ credentialId: "c1", transports: null }] as never);

    const res = await POST(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.options).toEqual({ challenge: "chal" });
    expect(mockSetChallenge).toHaveBeenCalledWith(expect.anything(), "u1", "authentication", "chal");
  });
});
