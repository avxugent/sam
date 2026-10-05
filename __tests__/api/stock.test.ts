import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    stockItem: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { GET, POST } from "@/app/api/stock/route";
import { PUT, DELETE } from "@/app/api/stock/[id]/route";

const mockAuth = vi.mocked(auth);
const mockFindMany = vi.mocked(prisma.stockItem.findMany);
const mockFindUnique = vi.mocked(prisma.stockItem.findUnique);
const mockCreate = vi.mocked(prisma.stockItem.create);
const mockUpdate = vi.mocked(prisma.stockItem.update);
const mockDelete = vi.mocked(prisma.stockItem.delete);

function session(role: "ADMIN" | "EDITOR" | "VIEWER") {
  return { user: { id: "u1", role, name: "Test", email: "t@test.com" } };
}

function req(method: string, url: string, body?: object) {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const PARAMS = Promise.resolve({ id: "item-1" });

const SAMPLE_ITEM = {
  id: "item-1",
  typeId: "type-1",
  manufacturerId: "mfr-1",
  model: "Dell U2722D",
  serialNumber: null,
  quantity: 5,
  notes: null,
  reservedForLocationId: null,
  invoiceNumber: null,
  invoiceDate: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  type: { id: "type-1", name: "Monitor" },
  manufacturer: { id: "mfr-1", name: "Dell" },
};

beforeEach(() => vi.clearAllMocks());

// ── GET /api/stock ─────────────────────────────────────────────────────────────

describe("GET /api/stock", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await GET(req("GET", "http://localhost/api/stock"));
    expect(res.status).toBe(401);
  });

  it("returns list of stock items", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    mockFindMany.mockResolvedValue([SAMPLE_ITEM] as never);
    const res = await GET(req("GET", "http://localhost/api/stock"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].model).toBe("Dell U2722D");
  });

  it("passes typeId filter to query", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    mockFindMany.mockResolvedValue([] as never);
    await GET(req("GET", "http://localhost/api/stock?typeId=type-1"));
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ typeId: "type-1" }),
    }));
  });

  it("passes locationId filter to query", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    mockFindMany.mockResolvedValue([] as never);
    await GET(req("GET", "http://localhost/api/stock?locationId=loc-1"));
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ locationId: "loc-1" }),
    }));
  });
});

// ── POST /api/stock ────────────────────────────────────────────────────────────

describe("POST /api/stock", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await POST(req("POST", "http://localhost/api/stock", { typeId: "t1", model: "M1", quantity: 1 }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for viewers", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    const res = await POST(req("POST", "http://localhost/api/stock", { typeId: "t1", model: "M1", quantity: 1 }));
    expect(res.status).toBe(403);
  });

  it("creates a bulk stock item", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockCreate.mockResolvedValue(SAMPLE_ITEM as never);
    const res = await POST(req("POST", "http://localhost/api/stock", { typeId: "type-1", model: "Dell U2722D", quantity: 5 }));
    expect(res.status).toBe(201);
  });

  it("returns 400 if typeId missing", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    const res = await POST(req("POST", "http://localhost/api/stock", { model: "X", quantity: 1 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 if quantity > 1 with serial number set", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    const res = await POST(req("POST", "http://localhost/api/stock", {
      typeId: "t1", model: "X", serialNumber: "SN123", quantity: 3,
    }));
    expect(res.status).toBe(400);
  });

  it("allows quantity=1 with serial number", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockCreate.mockResolvedValue({ ...SAMPLE_ITEM, serialNumber: "SN123", quantity: 1 } as never);
    const res = await POST(req("POST", "http://localhost/api/stock", {
      typeId: "t1", model: "Projector X", serialNumber: "SN123", quantity: 1,
    }));
    expect(res.status).toBe(201);
  });

  it("returns 400 for an invalid MAC address", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    const res = await POST(req("POST", "http://localhost/api/stock", {
      typeId: "t1", model: "X", quantity: 1, macAddress: "not-a-mac",
    }));
    expect(res.status).toBe(400);
  });

  it("stores a valid MAC address in metadata", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockCreate.mockResolvedValue(SAMPLE_ITEM as never);
    const res = await POST(req("POST", "http://localhost/api/stock", {
      typeId: "type-1", model: "Dell U2722D", quantity: 1, macAddress: "AA:BB:CC:DD:EE:FF",
    }));
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        metadata: JSON.stringify({ macAddresses: [{ address: "AA:BB:CC:DD:EE:FF" }] }),
      }),
    }));
  });

  it("normalizes a MAC with no separators to colon form before storing", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockCreate.mockResolvedValue(SAMPLE_ITEM as never);
    await POST(req("POST", "http://localhost/api/stock", {
      typeId: "type-1", model: "Dell U2722D", quantity: 1, macAddress: "aabbccddeeff",
    }));
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        metadata: JSON.stringify({ macAddresses: [{ address: "AA:BB:CC:DD:EE:FF" }] }),
      }),
    }));
  });

  it("leaves metadata null when no MAC is given", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockCreate.mockResolvedValue(SAMPLE_ITEM as never);
    await POST(req("POST", "http://localhost/api/stock", { typeId: "type-1", model: "M", quantity: 1 }));
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ metadata: null }),
    }));
  });

  it("stores the picked storage location", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockCreate.mockResolvedValue({ ...SAMPLE_ITEM, locationId: "loc-1" } as never);
    await POST(req("POST", "http://localhost/api/stock", {
      typeId: "type-1", model: "M", quantity: 1, locationId: "loc-1",
    }));
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ locationId: "loc-1" }),
    }));
  });

  it("defaults locationId to null when not given", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockCreate.mockResolvedValue(SAMPLE_ITEM as never);
    await POST(req("POST", "http://localhost/api/stock", { typeId: "type-1", model: "M", quantity: 1 }));
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ locationId: null }),
    }));
  });
});

// ── PUT /api/stock/[id] ────────────────────────────────────────────────────────

describe("PUT /api/stock/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await PUT(req("PUT", "http://localhost/api/stock/item-1", { model: "Updated" }), { params: PARAMS });
    expect(res.status).toBe(401);
  });

  it("returns 403 for viewers", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    const res = await PUT(req("PUT", "http://localhost/api/stock/item-1", { model: "Updated" }), { params: PARAMS });
    expect(res.status).toBe(403);
  });

  it("returns 404 if item not found", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    mockFindUnique.mockResolvedValue(null as never);
    const res = await PUT(req("PUT", "http://localhost/api/stock/item-1", { model: "Updated" }), { params: PARAMS });
    expect(res.status).toBe(404);
  });

  it("updates item successfully", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockFindUnique.mockResolvedValue(SAMPLE_ITEM as never);
    mockUpdate.mockResolvedValue({ ...SAMPLE_ITEM, model: "Updated" } as never);
    const res = await PUT(req("PUT", "http://localhost/api/stock/item-1", { model: "Updated" }), { params: PARAMS });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.model).toBe("Updated");
  });

  it("writes a MAC address into metadata", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockFindUnique.mockResolvedValue(SAMPLE_ITEM as never);
    mockUpdate.mockResolvedValue(SAMPLE_ITEM as never);
    await PUT(req("PUT", "http://localhost/api/stock/item-1", { macAddress: "AA:BB:CC:DD:EE:FF" }), { params: PARAMS });
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        metadata: JSON.stringify({ macAddresses: [{ address: "AA:BB:CC:DD:EE:FF" }] }),
      }),
    }));
  });

  it("normalizes a Cisco dot-grouped MAC to colon form on update", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockFindUnique.mockResolvedValue(SAMPLE_ITEM as never);
    mockUpdate.mockResolvedValue(SAMPLE_ITEM as never);
    await PUT(req("PUT", "http://localhost/api/stock/item-1", { macAddress: "aabb.ccdd.eeff" }), { params: PARAMS });
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        metadata: JSON.stringify({ macAddresses: [{ address: "AA:BB:CC:DD:EE:FF" }] }),
      }),
    }));
  });

  it("preserves other metadata keys when updating the MAC", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockFindUnique.mockResolvedValue({
      ...SAMPLE_ITEM,
      metadata: JSON.stringify({ hostname: "host1", macAddresses: [{ address: "00:00:00:00:00:00" }] }),
    } as never);
    mockUpdate.mockResolvedValue(SAMPLE_ITEM as never);
    await PUT(req("PUT", "http://localhost/api/stock/item-1", { macAddress: "AA:BB:CC:DD:EE:FF" }), { params: PARAMS });
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        metadata: JSON.stringify({ hostname: "host1", macAddresses: [{ address: "AA:BB:CC:DD:EE:FF" }] }),
      }),
    }));
  });

  it("clears the MAC from metadata when given an empty string", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockFindUnique.mockResolvedValue({
      ...SAMPLE_ITEM,
      metadata: JSON.stringify({ macAddresses: [{ address: "AA:BB:CC:DD:EE:FF" }] }),
    } as never);
    mockUpdate.mockResolvedValue(SAMPLE_ITEM as never);
    await PUT(req("PUT", "http://localhost/api/stock/item-1", { macAddress: "" }), { params: PARAMS });
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ metadata: null }),
    }));
  });

  it("returns 400 for an invalid MAC address", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockFindUnique.mockResolvedValue(SAMPLE_ITEM as never);
    const res = await PUT(req("PUT", "http://localhost/api/stock/item-1", { macAddress: "xyz" }), { params: PARAMS });
    expect(res.status).toBe(400);
  });

  it("updates the storage location", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockFindUnique.mockResolvedValue(SAMPLE_ITEM as never);
    mockUpdate.mockResolvedValue({ ...SAMPLE_ITEM, locationId: "loc-2" } as never);
    await PUT(req("PUT", "http://localhost/api/stock/item-1", { locationId: "loc-2" }), { params: PARAMS });
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ locationId: "loc-2" }),
    }));
  });
});

// ── DELETE /api/stock/[id] ─────────────────────────────────────────────────────

describe("DELETE /api/stock/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await DELETE(req("DELETE", "http://localhost/api/stock/item-1"), { params: PARAMS });
    expect(res.status).toBe(401);
  });

  it("returns 403 for viewers", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    mockFindUnique.mockResolvedValue(SAMPLE_ITEM as never);
    const res = await DELETE(req("DELETE", "http://localhost/api/stock/item-1"), { params: PARAMS });
    expect(res.status).toBe(403);
  });

  it("returns 404 if not found", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    mockFindUnique.mockResolvedValue(null as never);
    const res = await DELETE(req("DELETE", "http://localhost/api/stock/item-1"), { params: PARAMS });
    expect(res.status).toBe(404);
  });

  it("deletes item as admin", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    mockFindUnique.mockResolvedValue(SAMPLE_ITEM as never);
    mockDelete.mockResolvedValue(SAMPLE_ITEM as never);
    const res = await DELETE(req("DELETE", "http://localhost/api/stock/item-1"), { params: PARAMS });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
