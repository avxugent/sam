import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  prisma: { user: { findMany: vi.fn() } },
}));
vi.mock("@/lib/auth", () => ({ __esModule: true, auth: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { GET } from "@/app/api/users/lite/route";

const mockAuth = vi.mocked(auth);
const mockFindMany = vi.mocked(prisma.user.findMany);

function session(role: string) {
  return { user: { id: "u1", email: "a@b.c", role } } as never;
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/users/lite", () => {
  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await GET()).status).toBe(401);
  });

  it("403 for viewers", async () => {
    mockAuth.mockResolvedValue(session("VIEWER"));
    expect((await GET()).status).toBe(403);
  });

  it("returns only id and name for editors", async () => {
    mockAuth.mockResolvedValue(session("EDITOR"));
    mockFindMany.mockResolvedValue([{ id: "u2", name: "Jane" }] as never);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "u2", name: "Jane" }]);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ select: { id: true, name: true } })
    );
  });
});
