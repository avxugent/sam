import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    manufacturer: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { GET } from "@/app/api/manufacturers/route";

const mockAuth = vi.mocked(auth);
const mockFindMany = vi.mocked(prisma.manufacturer.findMany);

const session = () => ({ user: { id: "u1", role: "VIEWER", email: "u@test.com" } });

function req(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/manufacturers");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFindMany.mockResolvedValue([]);
});

describe("GET /api/manufacturers", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("lists all manufacturers when no typeId is given", async () => {
    mockAuth.mockResolvedValue(session() as never);
    await GET(req());
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: undefined }));
  });

  it("scopes to manufacturers with at least one Model under the given asset type", async () => {
    mockAuth.mockResolvedValue(session() as never);
    await GET(req({ typeId: "t1" }));
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { models: { some: { typeId: "t1" } } } })
    );
  });

  it("400 for an over-long typeId, without querying", async () => {
    mockAuth.mockResolvedValue(session() as never);
    expect((await GET(req({ typeId: "x".repeat(192) }))).status).toBe(400);
    expect(mockFindMany).not.toHaveBeenCalled();
  });
});
