import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    asset: {
      findUnique: vi.fn(),
    },
    location: {
      findUnique: vi.fn(),
    },
    stockItem: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { POST } from "@/app/api/assets/[id]/return-to-stock/route";

const mockAuth = vi.mocked(auth);
const mockFindUnique = vi.mocked(prisma.asset.findUnique);
const mockLocationFindUnique = vi.mocked(prisma.location.findUnique);
const mockTransaction = vi.mocked(prisma.$transaction);

function session(role: "ADMIN" | "EDITOR" | "VIEWER") {
  return { user: { id: "u1", role, name: "T", email: "t@test.com" } };
}

function makeReq(body: object | undefined = { locationId: "loc-1" }) {
  return new NextRequest("http://localhost/api/assets/asset-1/return-to-stock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const PARAMS = Promise.resolve({ id: "asset-1" });

const VALID_ASSET = {
  id: "asset-1",
  model: "Dell Monitor",
  serialNumber: "SN-001",
  typeId: "type-1",
  manufacturerId: "mfr-1",
  invoiceNumber: null,
  invoiceDate: null,
  notes: null,
  hostname: null,
  warrantyMonths: null,
  vaultPath: null,
  status: "INSTALLED",
  location: { name: "Room 101" },
  macAddresses: [],
  customFields: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockLocationFindUnique.mockResolvedValue({ id: "loc-1" } as never);
});

describe("POST /api/assets/[id]/return-to-stock", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await POST(makeReq(), { params: PARAMS });
    expect(res.status).toBe(401);
  });

  it("returns 403 for viewers", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    const res = await POST(makeReq(), { params: PARAMS });
    expect(res.status).toBe(403);
  });

  it("returns 400 when locationId is missing", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    const res = await POST(makeReq({}), { params: PARAMS });
    expect(res.status).toBe(400);
  });

  it("returns 400 when the location does not exist", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockLocationFindUnique.mockResolvedValue(null as never);
    const res = await POST(makeReq(), { params: PARAMS });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/location/i);
  });

  it("returns 404 if asset not found", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockFindUnique.mockResolvedValue(null as never);
    const res = await POST(makeReq(), { params: PARAMS });
    expect(res.status).toBe(404);
  });

  it("returns 400 for decommissioned assets", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockFindUnique.mockResolvedValue({ ...VALID_ASSET, status: "DECOMMISSIONED" } as never);
    const res = await POST(makeReq(), { params: PARAMS });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/decommissioned/i);
  });

  it("returns 400 if asset has no type", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockFindUnique.mockResolvedValue({ ...VALID_ASSET, typeId: null } as never);
    const res = await POST(makeReq(), { params: PARAMS });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/type/i);
  });

  it("returns 400 if asset has no model", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockFindUnique.mockResolvedValue({ ...VALID_ASSET, model: null } as never);
    const res = await POST(makeReq(), { params: PARAMS });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/model/i);
  });

  it("returns stockItemId on success and stores the chosen locationId", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockFindUnique.mockResolvedValue(VALID_ASSET as never);
    let capturedData: Record<string, unknown> = {};
    mockTransaction.mockImplementation(async (fn) => fn({
      stockItem: {
        create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          capturedData = data;
          return { id: "stock-1", model: "Dell Monitor" };
        }),
      },
      asset: { delete: vi.fn().mockResolvedValue({}) },
    } as never));
    const res = await POST(makeReq(), { params: PARAMS });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stockItemId).toBe("stock-1");
    expect(capturedData.locationId).toBe("loc-1");
  });

  it("serializes mac addresses and custom fields into metadata", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    const assetWithData = {
      ...VALID_ASSET,
      hostname: "device.example.com",
      warrantyMonths: 24,
      macAddresses: [{ address: "AA:BB:CC:DD:EE:FF" }],
      customFields: [{ key: "rack", value: "A1" }],
    };
    mockFindUnique.mockResolvedValue(assetWithData as never);

    let capturedData: Record<string, unknown> = {};
    mockTransaction.mockImplementation(async (fn) => fn({
      stockItem: {
        create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          capturedData = data;
          return { id: "stock-2", model: "Dell Monitor" };
        }),
      },
      asset: { delete: vi.fn().mockResolvedValue({}) },
    } as never));

    const res = await POST(makeReq(), { params: PARAMS });
    expect(res.status).toBe(200);

    const meta = JSON.parse(capturedData.metadata as string);
    expect(meta.macAddresses).toEqual([{ address: "AA:BB:CC:DD:EE:FF" }]);
    expect(meta.customFields).toEqual([{ key: "rack", value: "A1" }]);
    expect(meta.hostname).toBe("device.example.com");
    expect(meta.warrantyMonths).toBe(24);
  });
});
