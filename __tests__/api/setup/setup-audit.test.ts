import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { create: vi.fn(), count: vi.fn() },
  },
}));

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("bcryptjs", () => ({
  default: { compare: vi.fn(), hash: vi.fn() },
  compare: vi.fn(),
  hash: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import bcrypt from "bcryptjs";
import { POST as setup } from "@/app/api/setup/route";

const mockLogAudit = vi.mocked(logAudit);

function req(url: string, body?: object, method = "POST") {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : "{}",
  });
}

beforeEach(() => vi.clearAllMocks());

describe("audit — initial setup", () => {
  it("logs CREATE on User for first admin", async () => {
    vi.mocked(prisma.user.count).mockResolvedValue(0 as never);
    vi.mocked(bcrypt.hash).mockResolvedValue("hash" as never);
    vi.mocked(prisma.user.create).mockResolvedValue({ id: "admin1", email: "admin@test.com" } as never);

    const res = await setup(req("http://localhost/api/setup", { name: "Admin", email: "admin@test.com", password: "password1" }));
    expect(res.status).toBe(200);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CREATE", entityType: "User", entityId: "admin1", entityName: "admin@test.com" })
    );
  });

  it("does not log when setup already completed", async () => {
    vi.mocked(prisma.user.count).mockResolvedValue(1 as never);
    const res = await setup(req("http://localhost/api/setup", { name: "X", email: "x@test.com", password: "password1" }));
    expect(res.status).toBe(403);
    expect(mockLogAudit).not.toHaveBeenCalled();
  });
});
