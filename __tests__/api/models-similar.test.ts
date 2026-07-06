import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    asset: { findMany: vi.fn(), findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { GET } from "@/app/api/models/similar/route";

const mockAuth = vi.mocked(auth);
const mockFindMany = vi.mocked(prisma.asset.findMany);
const mockFindUnique = vi.mocked(prisma.asset.findUnique);

function session() {
  return { user: { id: "u1", role: "VIEWER", name: "U", email: "u@test.com" } };
}

function req(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/models/similar");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url);
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/models/similar", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await GET(req({ q: "PowerEdge R740" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when q is missing", async () => {
    mockAuth.mockResolvedValue(session() as never);
    const res = await GET(req());
    expect(res.status).toBe(400);
  });

  it("returns a fuzzy match when one exists", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockFindMany.mockResolvedValue([{ model: "PowerEdge R740" }] as never);

    const res = await GET(req({ q: "poweredge  r740" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.match).toEqual({ model: "PowerEdge R740", distance: 0 });
  });

  it("returns match: null when nothing is close", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockFindMany.mockResolvedValue([{ model: "Dell OptiPlex 7090" }] as never);

    const res = await GET(req({ q: "Epson EB-W06" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.match).toBeNull();
  });

  it("excludes the edited asset's own current model", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockFindUnique.mockResolvedValue({ model: "poweredge  r740" } as never);
    mockFindMany.mockResolvedValue([{ model: "poweredge  r740" }] as never);

    const res = await GET(req({ q: "PowerEdge R740", excludeAssetId: "a1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.match).toBeNull();
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: "a1" },
      select: { model: true },
    });
  });
});
