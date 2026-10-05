import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    asset: { findMany: vi.fn() },
    stockItem: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { GET } from "@/app/api/models/route";

const mockAuth = vi.mocked(auth);
const mockFindMany = vi.mocked(prisma.asset.findMany);
const mockStockFindMany = vi.mocked(prisma.stockItem.findMany);

function session() {
  return { user: { id: "u1", role: "VIEWER", name: "U", email: "u@test.com" } };
}

function req(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/models");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFindMany.mockResolvedValue([] as never);
  mockStockFindMany.mockResolvedValue([] as never);
});

describe("GET /api/models", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("returns deduplicated model suggestions", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockFindMany.mockResolvedValue([
      { model: "Epson EB-W06", typeId: "t1", manufacturerId: "m1" },
      { model: "Epson EB-W06", typeId: "t1", manufacturerId: "m1" },
      { model: "Dell P2422H", typeId: "t2", manufacturerId: "m2" },
    ] as never);

    const res = await GET(req({ q: "E" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0]).toEqual({ model: "Dell P2422H", typeId: "t2", manufacturerId: "m2" });
    expect(body[1]).toEqual({ model: "Epson EB-W06", typeId: "t1", manufacturerId: "m1" });
  });

  it("includes models from stock items alongside asset models", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockFindMany.mockResolvedValue([
      { model: "Epson EB-W06", typeId: "t1", manufacturerId: "m1" },
    ] as never);
    mockStockFindMany.mockResolvedValue([
      { model: "Dell P2422H", typeId: "t2", manufacturerId: "m2" },
    ] as never);

    const res = await GET(req({ q: "" }));
    const body = await res.json();
    expect(body.map((s: { model: string }) => s.model)).toEqual(["Dell P2422H", "Epson EB-W06"]);
  });

  it("keeps the asset spelling when the same model exists in stock with different casing", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockFindMany.mockResolvedValue([
      { model: "Epson EB-W06", typeId: "t1", manufacturerId: "m1" },
    ] as never);
    mockStockFindMany.mockResolvedValue([
      { model: "epson eb-w06", typeId: "t1", manufacturerId: "m1" },
    ] as never);

    const res = await GET(req({ q: "epson" }));
    const body = await res.json();
    expect(body).toEqual([{ model: "Epson EB-W06", typeId: "t1", manufacturerId: "m1" }]);
  });

  it("applies the search term and typeId filter to the stock query", async () => {
    mockAuth.mockResolvedValue(session() as never);

    await GET(req({ q: "Dell", typeId: "t2" }));

    expect(mockStockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { model: { contains: "Dell" }, typeId: "t2" },
      })
    );
  });

  it("deduplicates case/punctuation variants of the same model, keeping the first-seen spelling", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockFindMany.mockResolvedValue([
      { model: "Dell PowerEdge R740", typeId: "t1", manufacturerId: "m1" },
      { model: "dell poweredge r740", typeId: "t1", manufacturerId: "m1" },
      { model: "Dell PowerEdge  R740", typeId: "t1", manufacturerId: "m1" },
    ] as never);

    const res = await GET(req({ q: "Dell" }));
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toEqual({ model: "Dell PowerEdge R740", typeId: "t1", manufacturerId: "m1" });
  });

  it("passes typeId and manufacturerId filters to prisma", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockFindMany.mockResolvedValue([
      { model: "Epson EB-W06", typeId: "t1", manufacturerId: "m1" },
    ] as never);

    await GET(req({ q: "Epson", typeId: "t1", manufacturerId: "m1" }));

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ typeId: "t1", manufacturerId: "m1" }),
      })
    );
  });

  it("omits typeId/manufacturerId filter when not provided", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockFindMany.mockResolvedValue([] as never);

    await GET(req({ q: "Dell" }));

    const where = mockFindMany.mock.calls[0][0].where;
    expect(where).not.toHaveProperty("typeId");
    expect(where).not.toHaveProperty("manufacturerId");
  });
});
