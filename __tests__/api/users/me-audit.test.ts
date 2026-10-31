import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn(), hash: vi.fn() },
  compare: vi.fn(),
  hash: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import bcrypt from "bcryptjs";
import { PATCH as patchMe } from "@/app/api/users/me/route";

const mockAuth = vi.mocked(auth);
const mockLogAudit = vi.mocked(logAudit);

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

describe("audit — users/me password change", () => {
  it("logs UPDATE on User for password change", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ passwordHash: "old", provider: "credentials" } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(bcrypt.hash).mockResolvedValue("newhash" as never);

    const res = await patchMe(
      req("http://localhost/api/users/me", { currentPassword: "old", newPassword: "newpass12", confirmPassword: "newpass12" }, "PATCH")
    );
    expect(res.status).toBe(200);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "UPDATE", entityType: "User", detail: expect.objectContaining({ event: expect.stringContaining("Password changed") }) })
    );
  });

  it("does NOT log for preference-only change (theme)", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ passwordHash: "old", provider: "credentials" } as never);

    const res = await patchMe(req("http://localhost/api/users/me", { theme: "dark" }, "PATCH"));
    expect(res.status).toBe(200);
    expect(mockLogAudit).not.toHaveBeenCalled();
  });
});
