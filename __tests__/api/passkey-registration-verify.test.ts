import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: { passkey: { create: vi.fn() } },
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(), signIn: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/webauthn", () => ({
  verifyRegistration: vi.fn(),
  readChallengeCookie: vi.fn(),
  clearChallengeCookie: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { auth, signIn } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { verifyRegistration, readChallengeCookie, clearChallengeCookie } from "@/lib/webauthn";
import { POST } from "@/app/api/auth/passkey/registration-verify/route";

const mockAuth = vi.mocked(auth);
const mockSignIn = vi.mocked(signIn);
const mockCreate = vi.mocked(prisma.passkey.create);
const mockLogAudit = vi.mocked(logAudit);
const mockVerify = vi.mocked(verifyRegistration);
const mockReadChallenge = vi.mocked(readChallengeCookie);
const mockClearChallenge = vi.mocked(clearChallengeCookie);

function req(body?: object) {
  return new NextRequest("http://localhost/api/auth/passkey/registration-verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function session(extra: Record<string, unknown> = {}) {
  return { user: { id: "u1", email: "a@b.com", role: "EDITOR" }, ...extra } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockReadChallenge.mockResolvedValue("the-challenge");
  mockCreate.mockResolvedValue({} as never);
});

describe("POST /api/auth/passkey/registration-verify", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await POST(req({ response: {} }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for an invalid body", async () => {
    mockAuth.mockResolvedValue(session());
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 and clears the cookie when the challenge is missing/expired", async () => {
    mockAuth.mockResolvedValue(session());
    mockReadChallenge.mockResolvedValue(null);
    const res = await POST(req({ response: {} }));
    expect(res.status).toBe(400);
    expect(mockClearChallenge).toHaveBeenCalled();
  });

  it("returns 400 when verification fails", async () => {
    mockAuth.mockResolvedValue(session());
    mockVerify.mockResolvedValue(null);
    const res = await POST(req({ response: {} }));
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates the passkey, audits, and clears the challenge cookie on success", async () => {
    mockAuth.mockResolvedValue(session());
    mockVerify.mockResolvedValue({
      credentialId: "cred1",
      publicKey: "pk1",
      counter: 0,
      transports: null,
      deviceType: "singleDevice",
      backedUp: false,
    });

    const res = await POST(req({ response: {}, label: "My laptop" }));
    expect(res.status).toBe(200);
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "u1", credentialId: "cred1", label: "My laptop" }),
    });
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CREATE", entityType: "User" })
    );
    expect(mockClearChallenge).toHaveBeenCalled();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("defaults the label when none is provided", async () => {
    mockAuth.mockResolvedValue(session());
    mockVerify.mockResolvedValue({
      credentialId: "cred1",
      publicKey: "pk1",
      counter: 0,
      transports: null,
      deviceType: "singleDevice",
      backedUp: false,
    });

    await POST(req({ response: {} }));
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ label: expect.stringContaining("Passkey") }),
    });
  });

  it("re-signs in via credentials-2fa-verified when the session needed forced 2FA setup", async () => {
    mockAuth.mockResolvedValue(session({ needs2FASetup: true }));
    mockVerify.mockResolvedValue({
      credentialId: "cred1",
      publicKey: "pk1",
      counter: 0,
      transports: null,
      deviceType: "singleDevice",
      backedUp: false,
    });

    await POST(req({ response: {} }));
    expect(mockSignIn).toHaveBeenCalledWith("credentials-2fa-verified", {
      userId: "u1",
      method: "passkey",
      redirect: false,
    });
  });
});
