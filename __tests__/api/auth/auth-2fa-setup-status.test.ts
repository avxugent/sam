import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn(), update: vi.fn() } } }));
vi.mock("@/lib/auth", () => {
  // One mock for both reads: auth() and the login-step routes' authIncludingPendingSteps().
  const read = vi.fn();
  return { auth: read, authIncludingPendingSteps: read };
});
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: () => undefined })) }));
vi.mock("@/lib/two-factor/totp", () => ({
  generateTotpSecret: vi.fn(() => ({ base32: "BASE32SECRET", otpauthUrl: "otpauth://totp/x" })),
  generateQrCodeDataUrl: vi.fn(async () => "data:image/png;base64,QR"),
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateTotpSecret } from "@/lib/two-factor/totp";
import { POST as setup } from "@/app/api/auth/2fa/setup/route";

const mockAuth = vi.mocked(auth);
const findUser = vi.mocked(prisma.user.findUnique);

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "u1", email: "me@x.com", role: "VIEWER" } } as never);
});

describe("POST /api/auth/2fa/setup", () => {
  it("401 without a session", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await setup()).status).toBe(401);
  });

  it("404 when the user row is gone", async () => {
    findUser.mockResolvedValue(null as never);
    expect((await setup()).status).toBe(404);
  });

  it("403 while the session still owes its second factor", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", email: "me@x.com", role: "VIEWER" }, needs2FA: true } as never);
    expect((await setup()).status).toBe(403);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("allows a forced 2FA setup session", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", email: "me@x.com", role: "VIEWER" }, needs2FASetup: true } as never);
    findUser.mockResolvedValue({ provider: "credentials", email: "me@x.com", totpEnabled: false } as never);
    expect((await setup()).status).toBe(200);
  });

  it("400 for SSO accounts", async () => {
    findUser.mockResolvedValue({ provider: "microsoft-entra-id", email: "me@x.com", totpEnabled: false } as never);
    expect((await setup()).status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("stores a pending secret and returns the QR code", async () => {
    findUser.mockResolvedValue({ provider: "credentials", email: "me@x.com", totpEnabled: true } as never);
    const res = await setup();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ qrCodeDataUrl: "data:image/png;base64,QR", secret: "BASE32SECRET" });
    expect(generateTotpSecret).toHaveBeenCalledWith("me@x.com");
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { totpSecret: "BASE32SECRET", totpEnabled: false },
    });
  });
});
