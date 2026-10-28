import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { asset: { findMany: vi.fn() } } }));
vi.mock("@/lib/locations/path", () => ({ getAllDescendantLocationIds: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAllDescendantLocationIds } from "@/lib/locations/path";
import { ASSET_LIST_INCLUDE } from "@/lib/assets/include";
import { GET } from "@/app/api/locations/[id]/assets/route";

const params = { params: Promise.resolve({ id: "room1" }) };
const get = (query = "") => GET(new NextRequest(`http://localhost/api/locations/room1/assets${query}`), params);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({ user: { id: "u1", role: "VIEWER" } } as never);
  vi.mocked(prisma.asset.findMany).mockResolvedValue([] as never);
});

describe("GET /api/locations/[id]/assets", () => {
  it("401 without a session", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    expect((await get()).status).toBe(401);
  });

  it("lists the location's installed assets in the shared list shape", async () => {
    expect((await get()).status).toBe(200);
    expect(prisma.asset.findMany).toHaveBeenCalledWith({
      where: { locationId: { in: ["room1"] }, status: "INSTALLED" },
      include: ASSET_LIST_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
    expect(getAllDescendantLocationIds).not.toHaveBeenCalled();
  });

  it("covers the whole subtree with ?recursive=true, same shape", async () => {
    vi.mocked(getAllDescendantLocationIds).mockResolvedValue(["sub1", "sub2"]);
    await get("?recursive=true&status=all");
    expect(prisma.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { locationId: { in: ["room1", "sub1", "sub2"] } }, include: ASSET_LIST_INCLUDE })
    );
  });
});
