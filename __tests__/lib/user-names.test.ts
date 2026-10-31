import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { user: { findMany: vi.fn() } } }));

import { prisma } from "@/lib/prisma";
import { userNamesById } from "@/lib/user-names";

beforeEach(() => vi.clearAllMocks());

describe("userNamesById()", () => {
  it("looks up each distinct id once and maps it to the name", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: "u1", name: "Ann" }] as never);
    const names = await userNamesById(["u1", null, "u1", "gone", undefined]);
    expect(prisma.user.findMany).toHaveBeenCalledWith({ where: { id: { in: ["u1", "gone"] } }, select: { id: true, name: true } });
    expect([...names]).toEqual([["u1", "Ann"]]);
  });

  it("skips the query when there is nothing to resolve", async () => {
    expect((await userNamesById([null, undefined])).size).toBe(0);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});
