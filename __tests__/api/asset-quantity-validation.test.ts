import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    asset: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    assetType: {
      findUnique: vi.fn(),
    },
    appSetting: {
      findUnique: vi.fn(),
    },
    supplier: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { POST as createAsset } from "@/app/api/locations/[id]/assets/route";
import { PUT as updateAsset } from "@/app/api/assets/[id]/route";

const mockAuth = vi.mocked(auth);
const mockAssetCreate = vi.mocked(prisma.asset.create);
const mockAssetFindUnique = vi.mocked(prisma.asset.findUnique);
const mockTransaction = vi.mocked(prisma.$transaction);

function session() {
  return { user: { id: "u1", role: "EDITOR", name: "T", email: "t@test.com" } };
}
function req(url: string, body: object, method = "POST") {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const BASE_BODY = { typeId: "t1", manufacturerId: "m1", modelId: "mo1" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.appSetting.findUnique).mockResolvedValue(null as never);
  vi.mocked(prisma.supplier.findMany).mockResolvedValue([] as never);
});

// ── POST /api/locations/[id]/assets ─────────────────────────────────────────

describe("POST /api/locations/[id]/assets — quantity", () => {
  const params = Promise.resolve({ id: "loc-1" });

  it("400s when quantity > 1 and a serial number is set", async () => {
    mockAuth.mockResolvedValue(session() as never);
    const res = await createAsset(
      req("http://x", { ...BASE_BODY, serialNumber: "SN-1", quantity: 5 }),
      { params }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.details.fieldErrors.quantity).toBeTruthy();
  });

  it("400s when quantity > 1 and hostname + MAC are set", async () => {
    mockAuth.mockResolvedValue(session() as never);
    const res = await createAsset(
      req("http://x", {
        ...BASE_BODY,
        hostname: "device.example.com",
        macAddresses: ["AA:BB:CC:DD:EE:FF"],
        quantity: 3,
      }),
      { params }
    );
    expect(res.status).toBe(400);
  });

  it("creates a bulk item with quantity > 1 when it has no identity fields", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockAssetCreate.mockResolvedValue({ id: "a1", modelId: "mo1", quantity: 12 } as never);
    const res = await createAsset(req("http://x", { ...BASE_BODY, quantity: 12 }), { params });
    expect(res.status).toBe(201);
    expect(mockAssetCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ quantity: 12 }) })
    );
  });

  it("defaults quantity to 1 when omitted", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockAssetCreate.mockResolvedValue({ id: "a1", modelId: "mo1", quantity: 1 } as never);
    const res = await createAsset(req("http://x", BASE_BODY), { params });
    expect(res.status).toBe(201);
    expect(mockAssetCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ quantity: 1 }) })
    );
  });

  it("400s on a non-positive quantity", async () => {
    mockAuth.mockResolvedValue(session() as never);
    const res = await createAsset(req("http://x", { ...BASE_BODY, quantity: 0 }), { params });
    expect(res.status).toBe(400);
  });
});

// ── PUT /api/assets/[id] ─────────────────────────────────────────────────────

describe("PUT /api/assets/[id] — quantity", () => {
  const params = Promise.resolve({ id: "asset-1" });
  const BULK_EXISTING = {
    id: "asset-1",
    typeId: "t1",
    serialNumber: null,
    hostname: null,
    quantity: 1,
    macAddresses: [],
    customFields: [],
    type: { name: "Battery" },
    manufacturer: { name: "Duracell" },
    location: { name: "Storage" },
  };
  const IDENTIFIED_EXISTING = {
    ...BULK_EXISTING,
    serialNumber: "SN-EXISTING",
    quantity: 1,
  };

  it("allows raising quantity on a bulk item with no identity", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockAssetFindUnique.mockResolvedValue(BULK_EXISTING as never);
    mockTransaction.mockResolvedValue({ id: "asset-1", quantity: 8 } as never);
    const res = await updateAsset(req("http://x", { quantity: 8 }, "PUT"), { params });
    expect(res.status).toBe(200);
  });

  it("400s raising quantity in the same request a serial number is set", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockAssetFindUnique.mockResolvedValue(BULK_EXISTING as never);
    const res = await updateAsset(
      req("http://x", { serialNumber: "SN-NEW", quantity: 4 }, "PUT"),
      { params }
    );
    expect(res.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("400s raising quantity via a partial update that omits the existing serial number", async () => {
    // The asset already has a serial number; a request that only touches
    // quantity must still be rejected using the persisted (before) state.
    mockAuth.mockResolvedValue(session() as never);
    mockAssetFindUnique.mockResolvedValue(IDENTIFIED_EXISTING as never);
    const res = await updateAsset(req("http://x", { quantity: 5 }, "PUT"), { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/quantity must be 1/i);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("does not re-check quantity when neither quantity nor identity fields are part of the update", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockAssetFindUnique.mockResolvedValue(IDENTIFIED_EXISTING as never);
    mockTransaction.mockResolvedValue({ id: "asset-1", notes: "updated" } as never);
    const res = await updateAsset(req("http://x", { notes: "updated" }, "PUT"), { params });
    expect(res.status).toBe(200);
  });

  it("allows clearing the serial number and raising quantity in the same request", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockAssetFindUnique.mockResolvedValue(IDENTIFIED_EXISTING as never);
    mockTransaction.mockResolvedValue({ id: "asset-1", quantity: 4, serialNumber: null } as never);
    const res = await updateAsset(
      req("http://x", { serialNumber: null, quantity: 4 }, "PUT"),
      { params }
    );
    expect(res.status).toBe(200);
  });
});
