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
  // Creation defaults (owner setting / supplier window): none configured
  vi.mocked(prisma.appSetting.findUnique).mockResolvedValue(null as never);
  vi.mocked(prisma.supplier.findMany).mockResolvedValue([] as never);
});

describe("POST /api/locations/[id]/assets — MAC address normalization", () => {
  const params = Promise.resolve({ id: "loc-1" });

  it("normalizes a hyphen-separated MAC to AA:BB:CC:DD:EE:FF on create", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockAssetCreate.mockResolvedValue({ id: "a1", modelId: "mo1" } as never);
    await createAsset(req("http://x", { ...BASE_BODY, macAddresses: ["aa-bb-cc-dd-ee-ff"] }), { params });
    expect(mockAssetCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          macAddresses: { create: [{ address: "AA:BB:CC:DD:EE:FF" }] },
        }),
      })
    );
  });

  it("normalizes a MAC with no separators", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockAssetCreate.mockResolvedValue({ id: "a1", modelId: "mo1" } as never);
    await createAsset(req("http://x", { ...BASE_BODY, macAddresses: ["aabbccddeeff"] }), { params });
    expect(mockAssetCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          macAddresses: { create: [{ address: "AA:BB:CC:DD:EE:FF" }] },
        }),
      })
    );
  });

  it("rejects a MAC address that can't be normalized (wrong digit count)", async () => {
    mockAuth.mockResolvedValue(session() as never);
    const res = await createAsset(req("http://x", { ...BASE_BODY, macAddresses: ["aa:bb:cc:dd:ee"] }), { params });
    expect(res.status).toBe(400);
    expect(mockAssetCreate).not.toHaveBeenCalled();
  });

  it("rejects a MAC address containing a non-hex character", async () => {
    mockAuth.mockResolvedValue(session() as never);
    const res = await createAsset(req("http://x", { ...BASE_BODY, macAddresses: ["gg:bb:cc:dd:ee:ff"] }), { params });
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/assets/[id] — MAC address normalization", () => {
  const params = Promise.resolve({ id: "asset-1" });
  const EXISTING = {
    id: "asset-1",
    quantity: 1,
    typeId: "t1",
    hostname: null,
    macAddresses: [],
    customFields: [],
    type: { name: "Recorder" },
    manufacturer: { name: "Epson" },
    location: { name: "Room 1" },
  };

  it("normalizes a Cisco dot-grouped MAC to colon format on update", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockAssetFindUnique.mockResolvedValue(EXISTING as never);
    const createMany = vi.fn();
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        macAddress: { deleteMany: vi.fn(), createMany },
        customField: { deleteMany: vi.fn(), createMany: vi.fn() },
        asset: { update: vi.fn().mockResolvedValue({ id: "asset-1" }) },
      };
      return cb(tx);
    });
    const res = await updateAsset(req("http://x", { macAddresses: ["aabb.ccdd.eeff"] }, "PUT"), { params });
    expect(res.status).toBe(200);
    expect(createMany).toHaveBeenCalledWith({
      data: [{ assetId: "asset-1", address: "AA:BB:CC:DD:EE:FF" }],
    });
  });

  it("rejects an unrecoverable MAC address on update", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockAssetFindUnique.mockResolvedValue(EXISTING as never);
    const res = await updateAsset(req("http://x", { macAddresses: ["not-a-mac"] }, "PUT"), { params });
    expect(res.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
