import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    passkey: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: vi.fn() }));
vi.mock("@/lib/two-factor/totp", () => ({ verifyTotpCode: vi.fn() }));
vi.mock("@/lib/two-factor/webauthn", () => ({
  readChallengeCookie: vi.fn(),
  verifyAuthentication: vi.fn(),
  clearChallengeCookie: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { consumeRateLimit } from "@/lib/rate-limit";
import { verifyTotpCode } from "@/lib/two-factor/totp";
import { readChallengeCookie, verifyAuthentication } from "@/lib/two-factor/webauthn";
import { DELETE } from "@/app/api/auth/passkey/[id]/route";

const mockAuth = vi.mocked(auth);
const mockFindUnique = vi.mocked(prisma.passkey.findUnique);
const mockDelete = vi.mocked(prisma.passkey.delete);
const mockLogAudit = vi.mocked(logAudit);

const PARAMS = Promise.resolve({ id: "pk1" });
const OWN_PASSKEY = { id: "pk1", userId: "u1", label: "Laptop", credentialId: "cred1", publicKey: "k", counter: 1, transports: null };

function req(body?: object) {
  return new NextRequest("http://localhost/api/auth/passkey/pk1", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "u1", email: "a@b.com" } } as never);
  mockFindUnique.mockResolvedValue(OWN_PASSKEY as never);
  vi.mocked(consumeRateLimit).mockReturnValue({ allowed: true, retryAfterMs: 0 });
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ totpEnabled: true, totpSecret: "S" } as never);
  vi.mocked(readChallengeCookie).mockResolvedValue("chal");
});

describe("DELETE /api/auth/passkey/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await DELETE(req({ code: "123456" }), { params: PARAMS });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the passkey does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await DELETE(req({ code: "123456" }), { params: PARAMS });
    expect(res.status).toBe(404);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("returns 404 (not 403) when the passkey belongs to another user", async () => {
    mockFindUnique.mockResolvedValue({ ...OWN_PASSKEY, userId: "someone-else" } as never);
    vi.mocked(verifyTotpCode).mockReturnValue(true);
    const res = await DELETE(req({ code: "123456" }), { params: PARAMS });
    expect(res.status).toBe(404);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("returns 400 without a confirmation", async () => {
    const res = await DELETE(req(), { params: PARAMS });
    expect(res.status).toBe(400);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("returns 400 for a wrong TOTP code", async () => {
    vi.mocked(verifyTotpCode).mockReturnValue(false);
    const res = await DELETE(req({ code: "000000" }), { params: PARAMS });
    expect(res.status).toBe(400);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("returns 400 for a failed passkey assertion", async () => {
    vi.mocked(verifyAuthentication).mockResolvedValue({ verified: false, newCounter: 1 });
    const res = await DELETE(req({ response: { id: "cred1" } }), { params: PARAMS });
    expect(res.status).toBe(400);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("returns 429 when rate-limited", async () => {
    vi.mocked(consumeRateLimit).mockReturnValue({ allowed: false, retryAfterMs: 1000 });
    const res = await DELETE(req({ code: "123456" }), { params: PARAMS });
    expect(res.status).toBe(429);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("deletes and audits with a valid TOTP code", async () => {
    vi.mocked(verifyTotpCode).mockReturnValue(true);
    const res = await DELETE(req({ code: "123456" }), { params: PARAMS });
    expect(res.status).toBe(200);
    expect(verifyTotpCode).toHaveBeenCalledWith("S", "123456");
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "pk1" } });
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "DELETE", entityType: "User", detail: { event: "Passkey removed", label: "Laptop" } })
    );
  });

  it("deletes with a valid passkey assertion", async () => {
    vi.mocked(verifyAuthentication).mockResolvedValue({ verified: true, newCounter: 2 });
    const res = await DELETE(req({ response: { id: "cred1" } }), { params: PARAMS });
    expect(res.status).toBe(200);
    expect(readChallengeCookie).toHaveBeenCalledWith(expect.anything(), "u1", "confirmation");
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "pk1" } });
  });
});
