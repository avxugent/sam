import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/generated/prisma/client", () => ({
  Prisma: {
    join: vi.fn((arr: unknown[]) => arr.join(",")),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    asset: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    location: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { GET } from "@/app/api/search/route";

const mockAuth = vi.mocked(auth);
const mockAssetCount = vi.mocked(prisma.asset.count);
const mockAssetFindMany = vi.mocked(prisma.asset.findMany);
const mockLocationCount = vi.mocked(prisma.location.count);
const mockLocationFindMany = vi.mocked(prisma.location.findMany);
const mockQueryRaw = vi.mocked(prisma.$queryRaw);

function session() {
  return { user: { id: "u1", role: "VIEWER", name: "User", email: "user@test.com" } };
}

function makeReq(q: string, page?: number) {
  const url = page
    ? `http://localhost/api/search?q=${encodeURIComponent(q)}&page=${page}`
    : `http://localhost/api/search?q=${encodeURIComponent(q)}`;
  return new NextRequest(url);
}

function fakeAsset(overrides: Partial<{
  id: string; model: { name: string } | null; serialNumber: string | null;
  hostname: string | null; notes: string | null;
}> = {}) {
  return {
    id: overrides.id ?? "a1",
    model: overrides.model ?? { name: "ThinkPad" },
    serialNumber: overrides.serialNumber ?? "SN001",
    hostname: overrides.hostname ?? null,
    invoiceNumber: null,
    notes: overrides.notes ?? null,
    locationId: "loc-1",
    type: { id: "t1", name: "Laptop" },
    manufacturer: { id: "m1", name: "Lenovo" },
    macAddresses: [],
    customFields: [],
    location: { id: "loc-1", name: "Building A", fiNumber: null, parentId: null },
  };
}

function fakeLocation(overrides: Partial<{ id: string; name: string; fiNumber: string | null }> = {}) {
  return {
    id: overrides.id ?? "loc-1",
    name: overrides.name ?? "Building A",
    description: null,
    fiNumber: overrides.fiNumber ?? null,
    address: null,
    city: null,
    country: null,
    parentId: null,
    _count: { children: 0 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockQueryRaw.mockResolvedValue([]);
});

// ── Auth ──────────────────────────────────────────────────────────────────────

describe("GET /api/search — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await GET(makeReq("thinkpad"));
    expect(res.status).toBe(401);
  });
});

// ── Short query ───────────────────────────────────────────────────────────────

describe("GET /api/search — short query", () => {
  it("returns empty results without hitting Prisma when query < 2 chars", async () => {
    mockAuth.mockResolvedValue(session() as never);
    const res = await GET(makeReq("x"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assets).toHaveLength(0);
    expect(body.locations).toHaveLength(0);
    expect(body.total).toBe(0);
    expect(body.totalAssets).toBe(0);
    expect(body.totalLocations).toBe(0);
    expect(body.assetPages).toBe(0);
    expect(body.locationPages).toBe(0);
    expect(mockAssetCount).not.toHaveBeenCalled();
    expect(mockAssetFindMany).not.toHaveBeenCalled();
  });
});

// ── Happy path ────────────────────────────────────────────────────────────────

describe("GET /api/search — happy path", () => {
  it("returns assets, locations and correct pagination metadata on page 1", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockAssetCount.mockResolvedValue(75 as never);
    mockLocationCount.mockResolvedValue(3 as never);
    mockAssetFindMany.mockResolvedValue([fakeAsset()] as never);
    mockLocationFindMany.mockResolvedValue([fakeLocation()] as never);
    mockQueryRaw.mockResolvedValue([{ rootId: "loc-1", assetCount: BigInt(5) }] as never);

    const res = await GET(makeReq("thinkpad"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.page).toBe(1);
    expect(body.totalAssets).toBe(75);
    expect(body.totalLocations).toBe(3);
    expect(body.total).toBe(78);
    expect(body.assetPages).toBe(2);     // ceil(75/50)
    expect(body.locationPages).toBe(1);  // ceil(3/20)
    expect(body.assets).toHaveLength(1);
    expect(body.locations).toHaveLength(1);
  });

  it("reflects the requested page number in the response", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockAssetCount.mockResolvedValue(120 as never);
    mockLocationCount.mockResolvedValue(0 as never);
    mockAssetFindMany.mockResolvedValue([fakeAsset()] as never);
    mockLocationFindMany.mockResolvedValue([] as never);

    const res = await GET(makeReq("thinkpad", 3));
    const body = await res.json();

    expect(body.page).toBe(3);
    expect(body.assetPages).toBe(3);  // ceil(120/50)
  });
});

// ── Pagination skip ───────────────────────────────────────────────────────────

describe("GET /api/search — pagination skip", () => {
  it("calls asset.findMany with skip=0 on page 1", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockAssetCount.mockResolvedValue(60 as never);
    mockLocationCount.mockResolvedValue(0 as never);
    mockAssetFindMany.mockResolvedValue([] as never);
    mockLocationFindMany.mockResolvedValue([] as never);

    await GET(makeReq("thinkpad", 1));

    expect(mockAssetFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 50 })
    );
  });

  it("calls asset.findMany with skip=50 on page 2", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockAssetCount.mockResolvedValue(60 as never);
    mockLocationCount.mockResolvedValue(0 as never);
    mockAssetFindMany.mockResolvedValue([] as never);
    mockLocationFindMany.mockResolvedValue([] as never);

    await GET(makeReq("thinkpad", 2));

    expect(mockAssetFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 50, take: 50 })
    );
  });

  it("calls location.findMany with skip=20 on page 2", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockAssetCount.mockResolvedValue(0 as never);
    mockLocationCount.mockResolvedValue(25 as never);
    mockAssetFindMany.mockResolvedValue([] as never);
    mockLocationFindMany.mockResolvedValue([] as never);

    await GET(makeReq("building", 2));

    expect(mockLocationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 20 })
    );
  });
});

// ── Invalid page param ────────────────────────────────────────────────────────

describe("GET /api/search — invalid page param", () => {
  it.each([
    ["0", 0],
    ["-5", -5],
    ["abc", NaN],
  ])("page=%s falls back to page 1 (skip=0)", async (pageStr) => {
    mockAuth.mockResolvedValue(session() as never);
    mockAssetCount.mockResolvedValue(10 as never);
    mockLocationCount.mockResolvedValue(0 as never);
    mockAssetFindMany.mockResolvedValue([] as never);
    mockLocationFindMany.mockResolvedValue([] as never);

    const url = `http://localhost/api/search?q=thinkpad&page=${pageStr}`;
    const res = await GET(new NextRequest(url));
    const body = await res.json();

    expect(body.page).toBe(1);
    expect(mockAssetFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0 })
    );
  });
});

// ── Scoring ───────────────────────────────────────────────────────────────────

describe("GET /api/search — asset scoring", () => {
  it("places model match (score 10) before notes match (score 1)", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockAssetCount.mockResolvedValue(2 as never);
    mockLocationCount.mockResolvedValue(0 as never);
    mockLocationFindMany.mockResolvedValue([] as never);

    const notesMatch = fakeAsset({ id: "a-notes", model: { name: "OtherModel" }, notes: "contains thinkpad keyword" });
    const modelMatch = fakeAsset({ id: "a-model", model: { name: "ThinkPad X1" }, notes: null });
    // DB returns notes-match first (e.g. more recent updatedAt)
    mockAssetFindMany.mockResolvedValue([notesMatch, modelMatch] as never);

    const res = await GET(makeReq("thinkpad"));
    const body = await res.json();

    expect(body.assets[0].id).toBe("a-model");
    expect(body.assets[1].id).toBe("a-notes");
  });
});

// ── CTE skipped when no locations ─────────────────────────────────────────────

describe("GET /api/search — location CTE", () => {
  it("skips $queryRaw when location findMany returns empty", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockAssetCount.mockResolvedValue(1 as never);
    mockLocationCount.mockResolvedValue(0 as never);
    mockAssetFindMany.mockResolvedValue([fakeAsset()] as never);
    mockLocationFindMany.mockResolvedValue([] as never);

    await GET(makeReq("thinkpad"));

    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it("calls $queryRaw and populates assets count when locations returned", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockAssetCount.mockResolvedValue(0 as never);
    mockLocationCount.mockResolvedValue(1 as never);
    mockAssetFindMany.mockResolvedValue([] as never);
    mockLocationFindMany.mockResolvedValue([fakeLocation({ id: "loc-1" })] as never);
    mockQueryRaw.mockResolvedValue([{ rootId: "loc-1", assetCount: BigInt(12) }] as never);

    const res = await GET(makeReq("building"));
    const body = await res.json();

    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    expect(body.locations[0]._count.assets).toBe(12);
  });
});
