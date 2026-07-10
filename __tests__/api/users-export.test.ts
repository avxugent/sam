import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  prisma: {
    user: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/auth", () => ({ __esModule: true, auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ __esModule: true, logAudit: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { GET } from "@/app/api/users/export/route";
import { NextRequest } from "next/server";

const mockAuth = vi.mocked(auth);
const mockFindMany = vi.mocked(prisma.user.findMany);
const mockLogAudit = vi.mocked(logAudit);

function session(role: string) {
  return { user: { id: "u1", email: "admin@x.y", role } } as never;
}

function req() {
  return new NextRequest("http://localhost/api/users/export");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/users/export", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin roles", async () => {
    mockAuth.mockResolvedValue(session("EDITOR"));
    const res = await GET(req());
    expect(res.status).toBe(403);
  });

  it("returns a CSV with header row and logs an EXPORT audit entry", async () => {
    mockAuth.mockResolvedValue(session("ADMIN"));
    mockFindMany.mockResolvedValue([
      {
        name: "Jane Doe",
        email: "jane@x.y",
        role: "ADMIN",
        provider: "credentials",
        totpEnabled: true,
        twoFactorRequired: false,
        lastLoginAt: new Date("2026-07-01T08:00:00Z"),
      },
      {
        name: "Team AV",
        email: "av@x.y",
        role: "VIEWER",
        provider: "credentials",
        totpEnabled: false,
        twoFactorRequired: true,
        lastLoginAt: null,
      },
    ] as never);

    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("sam-users-");

    const body = await res.text();
    const lines = body.split("\r\n");
    expect(lines[0]).toBe("NAME;EMAIL;ROLE;PROVIDER;2FA_ENABLED;2FA_REQUIRED;LAST_LOGIN");
    expect(lines[1]).toBe("Jane Doe;jane@x.y;ADMIN;credentials;yes;no;2026-07-01T08:00:00.000Z");
    expect(lines[2]).toBe("Team AV;av@x.y;VIEWER;credentials;no;yes;");

    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "EXPORT",
        entityType: "User",
        detail: { count: 2 },
      })
    );
  });
});
