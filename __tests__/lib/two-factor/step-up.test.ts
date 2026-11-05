import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    passkey: { findUnique: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/two-factor/totp", () => ({ verifyTotpCode: vi.fn() }));
vi.mock("@/lib/two-factor/webauthn", () => ({ readChallengeCookie: vi.fn(), verifyAuthentication: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { verifyTotpCode } from "@/lib/two-factor/totp";
import { readChallengeCookie, verifyAuthentication } from "@/lib/two-factor/webauthn";
import { confirmSecondFactor, stepUpSchema } from "@/lib/two-factor/step-up";

const req = {} as never;
const PASSKEY = { id: "pk1", userId: "u1", credentialId: "cred1", publicKey: "k", counter: 1, transports: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readChallengeCookie).mockResolvedValue("chal");
  vi.mocked(prisma.passkey.findUnique).mockResolvedValue(PASSKEY as never);
});

describe("stepUpSchema", () => {
  it("accepts a code or an assertion, and rejects neither", () => {
    expect(stepUpSchema.safeParse({ code: "123456" }).success).toBe(true);
    expect(stepUpSchema.safeParse({ response: { id: "x" } }).success).toBe(true);
    expect(stepUpSchema.safeParse({}).success).toBe(false);
    expect(stepUpSchema.safeParse({ code: "12" }).success).toBe(false);
  });
});

describe("confirmSecondFactor() with a TOTP code", () => {
  it("is false when TOTP is not enabled", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ totpEnabled: false, totpSecret: null } as never);
    expect(await confirmSecondFactor(req, "u1", { code: "123456" })).toBe(false);
    expect(verifyTotpCode).not.toHaveBeenCalled();
  });

  it("follows the code check when TOTP is enabled", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ totpEnabled: true, totpSecret: "S" } as never);
    vi.mocked(verifyTotpCode).mockReturnValue(true);
    expect(await confirmSecondFactor(req, "u1", { code: "123456" })).toBe(true);
    vi.mocked(verifyTotpCode).mockReturnValue(false);
    expect(await confirmSecondFactor(req, "u1", { code: "123456" })).toBe(false);
  });
});

describe("confirmSecondFactor() with a passkey assertion", () => {
  it("is false without a confirmation challenge", async () => {
    vi.mocked(readChallengeCookie).mockResolvedValue(null);
    expect(await confirmSecondFactor(req, "u1", { response: { id: "cred1" } })).toBe(false);
  });

  it("is false for a missing credential id or another user's passkey", async () => {
    expect(await confirmSecondFactor(req, "u1", { response: {} })).toBe(false);
    vi.mocked(prisma.passkey.findUnique).mockResolvedValue({ ...PASSKEY, userId: "u2" } as never);
    expect(await confirmSecondFactor(req, "u1", { response: { id: "cred1" } })).toBe(false);
    expect(verifyAuthentication).not.toHaveBeenCalled();
  });

  it("is false when the assertion does not verify", async () => {
    vi.mocked(verifyAuthentication).mockResolvedValue({ verified: false, newCounter: 1 });
    expect(await confirmSecondFactor(req, "u1", { response: { id: "cred1" } })).toBe(false);
    expect(prisma.passkey.update).not.toHaveBeenCalled();
  });

  it("is true for a verified assertion and bumps the counter", async () => {
    vi.mocked(verifyAuthentication).mockResolvedValue({ verified: true, newCounter: 5 });
    expect(await confirmSecondFactor(req, "u1", { response: { id: "cred1" } })).toBe(true);
    expect(verifyAuthentication).toHaveBeenCalledWith({ id: "cred1" }, "chal", PASSKEY);
    expect(prisma.passkey.update).toHaveBeenCalledWith({
      where: { id: "pk1" },
      data: { counter: 5, lastUsedAt: expect.any(Date) },
    });
  });
});
