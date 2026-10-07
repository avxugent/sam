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
const mockAssetTypeFindUnique = vi.mocked(prisma.assetType.findUnique);
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
function p2002() {
  return Object.assign(new Error("Duplicate"), { code: "P2002" });
}

const BASE_BODY = { typeId: "t1", manufacturerId: "m1", modelId: "mo1" };
const MAC = ["AA:BB:CC:DD:EE:FF"];

beforeEach(() => {
  vi.clearAllMocks();
  // Creation defaults (owner setting / supplier window): none configured
  vi.mocked(prisma.appSetting.findUnique).mockResolvedValue(null as never);
  vi.mocked(prisma.supplier.findMany).mockResolvedValue([] as never);
});

// ── POST /api/locations/[id]/assets ───────────────────────────────────────────

describe("POST /api/locations/[id]/assets — hostname format & uniqueness", () => {
  const params = Promise.resolve({ id: "loc-1" });

  it("400s when hostname isn't a valid FQDN and the type has no custom pattern", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockAssetTypeFindUnique.mockResolvedValue({ hostnamePattern: null } as never);
    const res = await createAsset(req("http://x", { ...BASE_BODY, hostname: "not-an-fqdn", macAddresses: MAC }), { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/required format/i);
  });

  it("400s when hostname doesn't match the type's custom pattern", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockAssetTypeFindUnique.mockResolvedValue({ hostnamePattern: "^rec-\\d{3}$" } as never);
    const res = await createAsset(req("http://x", { ...BASE_BODY, hostname: "other-001", macAddresses: MAC }), { params });
    expect(res.status).toBe(400);
  });

  it("accepts a non-FQDN hostname that matches the type's custom pattern", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockAssetTypeFindUnique.mockResolvedValue({ hostnamePattern: "^rec-\\d{3}$" } as never);
    mockAssetCreate.mockResolvedValue({ id: "a1", modelId: "mo1", hostname: "rec-001" } as never);
    const res = await createAsset(req("http://x", { ...BASE_BODY, hostname: "rec-001", macAddresses: MAC }), { params });
    expect(res.status).toBe(201);
  });

  it("falls back to the FQDN check when the type has no pattern", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockAssetTypeFindUnique.mockResolvedValue({ hostnamePattern: null } as never);
    mockAssetCreate.mockResolvedValue({ id: "a1", modelId: "mo1", hostname: "device.example.com" } as never);
    const res = await createAsset(req("http://x", { ...BASE_BODY, hostname: "device.example.com", macAddresses: MAC }), { params });
    expect(res.status).toBe(201);
  });

  it("skips hostname validation entirely when hostname is not set", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockAssetCreate.mockResolvedValue({ id: "a1", modelId: "mo1" } as never);
    const res = await createAsset(req("http://x", BASE_BODY), { params });
    expect(res.status).toBe(201);
    expect(mockAssetTypeFindUnique).not.toHaveBeenCalled();
  });

  it("returns 409 when the hostname is already used by another asset", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockAssetTypeFindUnique.mockResolvedValue({ hostnamePattern: null } as never);
    mockAssetCreate.mockRejectedValue(p2002());
    const res = await createAsset(req("http://x", { ...BASE_BODY, hostname: "device.example.com", macAddresses: MAC }), { params });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already assigned/i);
  });
});

// ── PUT /api/assets/[id] ───────────────────────────────────────────────────────

describe("PUT /api/assets/[id] — hostname format & uniqueness", () => {
  const params = Promise.resolve({ id: "asset-1" });
  const EXISTING = {
    id: "asset-1",
    typeId: "t1",
    hostname: "old.example.com",
    macAddresses: [{ address: "AA:BB:CC:DD:EE:FF" }],
    customFields: [],
    type: { name: "Recorder" },
    manufacturer: { name: "Epson" },
    location: { name: "Room 1" },
  };

  it("re-validates hostname when it changes and rejects a bad format", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockAssetFindUnique.mockResolvedValue(EXISTING as never);
    mockAssetTypeFindUnique.mockResolvedValue({ hostnamePattern: null } as never);
    const res = await updateAsset(req("http://x", { hostname: "not-an-fqdn", macAddresses: MAC }, "PUT"), { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/required format/i);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("re-validates against the new type's pattern when typeId changes", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockAssetFindUnique.mockResolvedValue(EXISTING as never);
    mockAssetTypeFindUnique.mockResolvedValue({ hostnamePattern: "^new-\\d{3}$" } as never);
    const res = await updateAsset(req("http://x", { typeId: "t2" }, "PUT"), { params });
    expect(res.status).toBe(400);
    expect(mockAssetTypeFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "t2" } }));
  });

  it("does not re-validate hostname when neither hostname nor typeId is part of the update", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockAssetFindUnique.mockResolvedValue(EXISTING as never);
    mockTransaction.mockResolvedValue({ id: "asset-1", notes: "updated" } as never);
    const res = await updateAsset(req("http://x", { notes: "updated" }, "PUT"), { params });
    expect(res.status).toBe(200);
    expect(mockAssetTypeFindUnique).not.toHaveBeenCalled();
  });

  it("accepts a hostname change that matches the current type's pattern", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockAssetFindUnique.mockResolvedValue(EXISTING as never);
    mockAssetTypeFindUnique.mockResolvedValue({ hostnamePattern: "^rec-\\d{3}$" } as never);
    mockTransaction.mockResolvedValue({ id: "asset-1", hostname: "rec-002" } as never);
    const res = await updateAsset(req("http://x", { hostname: "rec-002", macAddresses: MAC }, "PUT"), { params });
    expect(res.status).toBe(200);
  });

  it("returns 409 when the new hostname collides with another asset", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockAssetFindUnique.mockResolvedValue(EXISTING as never);
    mockAssetTypeFindUnique.mockResolvedValue({ hostnamePattern: null } as never);
    mockTransaction.mockRejectedValue(p2002());
    const res = await updateAsset(req("http://x", { hostname: "device.example.com", macAddresses: MAC }, "PUT"), { params });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already assigned/i);
  });
});
