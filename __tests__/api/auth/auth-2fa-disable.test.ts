import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/two-factor/totp", () => ({ verifyTotpCode: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { verifyTotpCode } from "@/lib/two-factor/totp";
import { POST as disable2fa } from "@/app/api/auth/2fa/disable/route";

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
  vi.mocked(prisma.user.update).mockResolvedValue({ id: "u1", email: "t@test.com" } as never);
});

describe("audit — 2FA disable", () => {
  it("logs UPDATE on self with '2FA disabled', no adminOverride", async () => {
    mockAuth.mockResolvedValue(session("EDITOR", "u1") as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ provider: "credentials", totpEnabled: true, totpSecret: "S", email: "t@test.com" } as never);
    mockVerify.mockReturnValue(true);

    const res = await disable2fa(req("http://localhost/api/auth/2fa/disable", { code: "123456" }));
    expect(res.status).toBe(200);
    const call = mockLogAudit.mock.calls[0][0];
    expect(call).toMatchObject({ action: "UPDATE", entityType: "User", entityId: "u1", detail: { event: "2FA disabled" } });
    expect(call.detail).not.toHaveProperty("adminOverride");
  });

  it("logs adminOverride when admin disables another user's 2FA", async () => {
    mockAuth.mockResolvedValue(session("ADMIN", "admin1") as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ provider: "credentials", totpEnabled: true, totpSecret: "S", email: "victim@test.com" } as never);

    const res = await disable2fa(req("http://localhost/api/auth/2fa/disable", { userId: "u2" }));
    expect(res.status).toBe(200);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "UPDATE",
        entityType: "User",
        entityId: "u2",
        entityName: "victim@test.com",
        detail: expect.objectContaining({ event: "2FA disabled", adminOverride: true }),
      })
    );
  });
});
