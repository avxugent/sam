import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    asset: { findMany: vi.fn() },
    stockItem: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { GET } from "@/app/api/models/[id]/usage/route";

const mockAuth = vi.mocked(auth);
const mockAssetFindMany = vi.mocked(prisma.asset.findMany);
const mockStockFindMany = vi.mocked(prisma.stockItem.findMany);

const session = () => ({ user: { id: "u1", role: "VIEWER", email: "u@test.com" } });
const params = (id = "mo1") => Promise.resolve({ id });
function req() {
  return new NextRequest("http://localhost/api/models/mo1/usage");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAssetFindMany.mockResolvedValue([]);
  mockStockFindMany.mockResolvedValue([]);
});

describe("GET /api/models/[id]/usage", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await GET(req(), { params: params() });
    expect(res.status).toBe(401);
  });

  it("returns both assets and stock items referencing the model", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockAssetFindMany.mockResolvedValue([{ id: "a1", serialNumber: "SN1", hostname: null, status: "INSTALLED", location: null }] as never);
    mockStockFindMany.mockResolvedValue([{ id: "s1", serialNumber: null, quantity: 3, location: null }] as never);

    const res = await GET(req(), { params: params() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assets).toHaveLength(1);
    expect(body.stockItems).toHaveLength(1);
    expect(mockAssetFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { modelId: "mo1" } }));
    expect(mockStockFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { modelId: "mo1" } }));
  });
});
