import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    asset: { create: vi.fn() },
    assetType: { findUnique: vi.fn() },
    appSetting: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    supplier: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { POST as createAsset } from "@/app/api/locations/[id]/assets/route";

const mockAuth = vi.mocked(auth);
const mockCreate = vi.mocked(prisma.asset.create);
const mockSetting = vi.mocked(prisma.appSetting.findUnique);
const mockUserFind = vi.mocked(prisma.user.findUnique);
const mockSupplierFindUnique = vi.mocked(prisma.supplier.findUnique);
const mockSupplierFindMany = vi.mocked(prisma.supplier.findMany);

const PARAMS = { params: Promise.resolve({ id: "loc-1" }) };
const BASE = { typeId: "t1", manufacturerId: "m1", modelId: "mo1" };

function session() {
  return { user: { id: "u1", role: "EDITOR", name: "T", email: "t@test.com" } } as never;
}

function req(body: object) {
  return new NextRequest("http://localhost/api/locations/loc-1/assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(session());
  mockCreate.mockResolvedValue({ id: "a1", modelId: "mo1" } as never);
  mockSetting.mockResolvedValue(null as never);
  mockSupplierFindMany.mockResolvedValue([] as never);
});

describe("POST /api/locations/[id]/assets — owner/supplier creation defaults", () => {
  it("applies the default owner and current-window supplier when neither is provided", async () => {
    mockSetting.mockResolvedValue({ value: "team-user" } as never);
    mockUserFind.mockResolvedValue({ id: "team-user" } as never);
    mockSupplierFindMany.mockResolvedValue([
      { id: "sup-1", defaultFrom: new Date("2000-01-01"), defaultUntil: null },
    ] as never);

    const res = await createAsset(req(BASE), PARAMS);
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ownerId: "team-user", supplierId: "sup-1" }),
      })
    );
  });

  it("keeps explicitly provided owner and supplier", async () => {
    mockSupplierFindUnique.mockResolvedValue({ id: "sup-x" } as never);
    const res = await createAsset(req({ ...BASE, ownerId: "u9", supplierId: "sup-x" }), PARAMS);
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ownerId: "u9", supplierId: "sup-x" }),
      })
    );
    // Defaults must not be consulted when both values are explicit
    expect(mockSetting).not.toHaveBeenCalled();
    expect(mockSupplierFindMany).not.toHaveBeenCalled();
  });

  it("explicit null clears — no default applied", async () => {
    mockSetting.mockResolvedValue({ value: "team-user" } as never);
    const res = await createAsset(req({ ...BASE, ownerId: null, supplierId: null }), PARAMS);
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ownerId: null, supplierId: null }),
      })
    );
  });

  it("400s on an unknown supplierId", async () => {
    mockSupplierFindUnique.mockResolvedValue(null as never);
    const res = await createAsset(req({ ...BASE, supplierId: "nope" }), PARAMS);
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("accepts criticality and endOfSupportDate and stores them", async () => {
    const res = await createAsset(
      req({ ...BASE, criticality: "HIGH", endOfSupportDate: "2030-06-30" }),
      PARAMS
    );
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          criticality: "HIGH",
          endOfSupportDate: new Date("2030-06-30"),
        }),
      })
    );
  });

  it("rejects an invalid criticality value", async () => {
    const res = await createAsset(req({ ...BASE, criticality: "EXTREME" }), PARAMS);
    expect(res.status).toBe(400);
  });
});
