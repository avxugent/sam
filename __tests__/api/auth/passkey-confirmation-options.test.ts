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
import { POST } from "@/app/api/auth/passkey/confirmation-options/route";

const mockAuth = vi.mocked(auth);
const mockFindMany = vi.mocked(prisma.passkey.findMany);

function req() {
  return new NextRequest("http://localhost/api/auth/passkey/confirmation-options", { method: "POST" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "u1" } } as never);
  vi.mocked(consumeRateLimit).mockReturnValue({ allowed: true, retryAfterMs: 0 });
  vi.mocked(buildAuthenticationOptions).mockResolvedValue({ challenge: "chal" } as never);
});

describe("POST /api/auth/passkey/confirmation-options", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await POST(req())).status).toBe(401);
  });

  it("returns 429 when rate-limited", async () => {
    vi.mocked(consumeRateLimit).mockReturnValue({ allowed: false, retryAfterMs: 1000 });
    expect((await POST(req())).status).toBe(429);
  });

  it("returns 400 when the user has no passkeys", async () => {
    mockFindMany.mockResolvedValue([]);
    expect((await POST(req())).status).toBe(400);
  });

  it("returns options and sets a confirmation challenge cookie", async () => {
    mockFindMany.mockResolvedValue([{ credentialId: "c1", transports: null }] as never);
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect((await res.json()).options).toEqual({ challenge: "chal" });
    expect(setChallengeCookie).toHaveBeenCalledWith(expect.anything(), "u1", "confirmation", "chal");
  });
});
