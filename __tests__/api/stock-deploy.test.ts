import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    stockItem: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    location: {
      findUnique: vi.fn(),
    },
    asset: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { POST } from "@/app/api/stock/[id]/deploy/route";

const mockAuth = vi.mocked(auth);
const mockStockFindUnique = vi.mocked(prisma.stockItem.findUnique);
const mockLocationFindUnique = vi.mocked(prisma.location.findUnique);
const mockTransaction = vi.mocked(prisma.$transaction);

function session(role: "ADMIN" | "EDITOR" | "VIEWER") {
  return { user: { id: "u1", role, name: "T", email: "t@test.com" } };
}

function req(body: object) {
  return new NextRequest("http://localhost/api/stock/item-1/deploy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const PARAMS = Promise.resolve({ id: "item-1" });

const BULK_ITEM = {
  id: "item-1",
  typeId: "type-1",
  manufacturerId: "mfr-1",
  model: "HDMI Cable",
  serialNumber: null,
  quantity: 10,
  invoiceNumber: null,
  invoiceDate: null,
};

const SERIALIZED_ITEM = {
  ...BULK_ITEM,
  model: "Epson Projector",
  serialNumber: "SN-EPSON-001",
  quantity: 1,
};

beforeEach(() => vi.clearAllMocks());

describe("POST /api/stock/[id]/deploy", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await POST(req({ locationId: "loc-1", quantity: 1 }), { params: PARAMS });
    expect(res.status).toBe(401);
  });

  it("returns 403 for viewers", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    const res = await POST(req({ locationId: "loc-1", quantity: 1 }), { params: PARAMS });
    expect(res.status).toBe(403);
  });

  it("returns 400 if locationId missing", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    const res = await POST(req({ quantity: 1 }), { params: PARAMS });
    expect(res.status).toBe(400);
  });

  it("returns 404 if location not found", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockLocationFindUnique.mockResolvedValue(null as never);
    mockStockFindUnique.mockResolvedValue(BULK_ITEM as never);
    const res = await POST(req({ locationId: "loc-missing", quantity: 1 }), { params: PARAMS });
    expect(res.status).toBe(404);
  });

  it("returns 404 if stock item not found", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockLocationFindUnique.mockResolvedValue({ id: "loc-1" } as never);
    mockStockFindUnique.mockResolvedValue(null as never);
    const res = await POST(req({ locationId: "loc-1", quantity: 1 }), { params: PARAMS });
    expect(res.status).toBe(404);
  });

  it("returns 400 if requested quantity exceeds available", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockLocationFindUnique.mockResolvedValue({ id: "loc-1" } as never);
    mockStockFindUnique.mockResolvedValue(BULK_ITEM as never);
    const res = await POST(req({ locationId: "loc-1", quantity: 20 }), { params: PARAMS });
    expect(res.status).toBe(400);
  });

  it("returns 400 if serialized item deployed with quantity > 1", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockLocationFindUnique.mockResolvedValue({ id: "loc-1" } as never);
    mockStockFindUnique.mockResolvedValue(SERIALIZED_ITEM as never);
    const res = await POST(req({ locationId: "loc-1", quantity: 2 }), { params: PARAMS });
    expect(res.status).toBe(400);
  });

  it("returns 400 if serialNumbers length != quantity", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    const res = await POST(req({ locationId: "loc-1", quantity: 3, serialNumbers: ["SN1", "SN2"] }), { params: PARAMS });
    expect(res.status).toBe(400);
  });

  it("deploys bulk item successfully", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockLocationFindUnique.mockResolvedValue({ id: "loc-1" } as never);
    mockStockFindUnique.mockResolvedValue(BULK_ITEM as never);
    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        stockItem: { update: vi.fn().mockResolvedValue({}), delete: vi.fn().mockResolvedValue({}) },
        asset: { create: vi.fn().mockResolvedValue({ id: "asset-new" }) },
      };
      return fn(tx as never);
    });

    const res = await POST(req({ locationId: "loc-1", quantity: 3 }), { params: PARAMS });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assetIds).toHaveLength(3);
    expect(body.locationId).toBe("loc-1");
  });

  it("deploys serialized item and deletes stock item when quantity reaches 0", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockLocationFindUnique.mockResolvedValue({ id: "loc-1" } as never);
    mockStockFindUnique.mockResolvedValue(SERIALIZED_ITEM as never);

    const txDelete = vi.fn().mockResolvedValue({});
    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        stockItem: { update: vi.fn(), delete: txDelete },
        asset: { create: vi.fn().mockResolvedValue({ id: "asset-new" }) },
      };
      return fn(tx as never);
    });

    const res = await POST(req({ locationId: "loc-1", quantity: 1 }), { params: PARAMS });
    expect(res.status).toBe(200);
    expect(txDelete).toHaveBeenCalled();
  });
});
