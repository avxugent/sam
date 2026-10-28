import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { passkey: { findMany: vi.fn() } },
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { GET } from "@/app/api/auth/passkey/list/route";

const mockAuth = vi.mocked(auth);
const mockFindMany = vi.mocked(prisma.passkey.findMany);

beforeEach(() => vi.clearAllMocks());

describe("GET /api/auth/passkey/list", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the current user's passkeys without sensitive fields", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } } as never);
    mockFindMany.mockResolvedValue([
      { id: "pk1", label: "Laptop", deviceType: "singleDevice", backedUp: false, createdAt: new Date(), lastUsedAt: null },
    ] as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.passkeys).toHaveLength(1);
    expect(body.passkeys[0]).not.toHaveProperty("credentialId");
    expect(body.passkeys[0]).not.toHaveProperty("publicKey");
    expect(body.passkeys[0]).not.toHaveProperty("counter");

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1" } })
    );
  });
});
