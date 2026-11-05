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
import { logAudit } from "@/lib/audit";
import { POST as createAsset } from "@/app/api/locations/[id]/assets/route";

const mockAuth = vi.mocked(auth);
const mockCreate = vi.mocked(prisma.asset.create);
const mockSetting = vi.mocked(prisma.appSetting.findUnique);
const mockUserFind = vi.mocked(prisma.user.findUnique);
const mockSupplierFindUnique = vi.mocked(prisma.supplier.findUnique);
const mockSupplierFindMany = vi.mocked(prisma.supplier.findMany);
const mockAssetTypeFindUnique = vi.mocked(prisma.assetType.findUnique);

const PARAMS = { params: Promise.resolve({ id: "loc-1" }) };
const BASE = { typeId: "t1", manufacturerId: "m1", modelId: "mo1" };
const MAC = ["AA:BB:CC:DD:EE:FF"];

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
function p2002() {
  return Object.assign(new Error("Duplicate"), { code: "P2002" });
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

describe("POST /api/locations/[id]/assets — hostname format & uniqueness", () => {

  it("400s when hostname isn't a valid FQDN and the type has no custom pattern", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockAssetTypeFindUnique.mockResolvedValue({ hostnamePattern: null } as never);
    const res = await createAsset(req({ ...BASE, hostname: "not-an-fqdn", macAddresses: MAC }), PARAMS);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/required format/i);
  });

  it("400s when hostname doesn't match the type's custom pattern", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockAssetTypeFindUnique.mockResolvedValue({ hostnamePattern: "^rec-\\d{3}$" } as never);
    const res = await createAsset(req({ ...BASE, hostname: "other-001", macAddresses: MAC }), PARAMS);
    expect(res.status).toBe(400);
  });

  it("accepts a non-FQDN hostname that matches the type's custom pattern", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockAssetTypeFindUnique.mockResolvedValue({ hostnamePattern: "^rec-\\d{3}$" } as never);
    mockCreate.mockResolvedValue({ id: "a1", modelId: "mo1", hostname: "rec-001" } as never);
    const res = await createAsset(req({ ...BASE, hostname: "rec-001", macAddresses: MAC }), PARAMS);
    expect(res.status).toBe(201);
  });

  it("falls back to the FQDN check when the type has no pattern", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockAssetTypeFindUnique.mockResolvedValue({ hostnamePattern: null } as never);
    mockCreate.mockResolvedValue({ id: "a1", modelId: "mo1", hostname: "device.example.com" } as never);
    const res = await createAsset(req({ ...BASE, hostname: "device.example.com", macAddresses: MAC }), PARAMS);
    expect(res.status).toBe(201);
  });

  it("skips hostname validation entirely when hostname is not set", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockCreate.mockResolvedValue({ id: "a1", modelId: "mo1" } as never);
    const res = await createAsset(req(BASE), PARAMS);
    expect(res.status).toBe(201);
    expect(mockAssetTypeFindUnique).not.toHaveBeenCalled();
  });

  it("returns 409 when the hostname is already used by another asset", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockAssetTypeFindUnique.mockResolvedValue({ hostnamePattern: null } as never);
    mockCreate.mockRejectedValue(p2002());
    const res = await createAsset(req({ ...BASE, hostname: "device.example.com", macAddresses: MAC }), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already assigned/i);
  });
});

describe("POST /api/locations/[id]/assets — MAC address normalization", () => {

  it("normalizes a hyphen-separated MAC to AA:BB:CC:DD:EE:FF on create", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockCreate.mockResolvedValue({ id: "a1", modelId: "mo1" } as never);
    await createAsset(req({ ...BASE, macAddresses: ["aa-bb-cc-dd-ee-ff"] }), PARAMS);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          macAddresses: { create: [{ address: "AA:BB:CC:DD:EE:FF" }] },
        }),
      })
    );
  });

  it("normalizes a MAC with no separators", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockCreate.mockResolvedValue({ id: "a1", modelId: "mo1" } as never);
    await createAsset(req({ ...BASE, macAddresses: ["aabbccddeeff"] }), PARAMS);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          macAddresses: { create: [{ address: "AA:BB:CC:DD:EE:FF" }] },
        }),
      })
    );
  });

  it("rejects a MAC address that can't be normalized (wrong digit count)", async () => {
    mockAuth.mockResolvedValue(session() as never);
    const res = await createAsset(req({ ...BASE, macAddresses: ["aa:bb:cc:dd:ee"] }), PARAMS);
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects a MAC address containing a non-hex character", async () => {
    mockAuth.mockResolvedValue(session() as never);
    const res = await createAsset(req({ ...BASE, macAddresses: ["gg:bb:cc:dd:ee:ff"] }), PARAMS);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/locations/[id]/assets — quantity", () => {

  it("400s when quantity > 1 and a serial number is set", async () => {
    mockAuth.mockResolvedValue(session() as never);
    const res = await createAsset(
      req({ ...BASE, serialNumber: "SN-1", quantity: 5 }),
      PARAMS
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.details.fieldErrors.quantity).toBeTruthy();
  });

  it("400s when quantity > 1 and hostname + MAC are set", async () => {
    mockAuth.mockResolvedValue(session() as never);
    const res = await createAsset(
      req({
        ...BASE,
        hostname: "device.example.com",
        macAddresses: ["AA:BB:CC:DD:EE:FF"],
        quantity: 3,
      }),
      PARAMS
    );
    expect(res.status).toBe(400);
  });

  it("creates a bulk item with quantity > 1 when it has no identity fields", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockCreate.mockResolvedValue({ id: "a1", modelId: "mo1", quantity: 12 } as never);
    const res = await createAsset(req({ ...BASE, quantity: 12 }), PARAMS);
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ quantity: 12 }) })
    );
  });

  it("defaults quantity to 1 when omitted", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockCreate.mockResolvedValue({ id: "a1", modelId: "mo1", quantity: 1 } as never);
    const res = await createAsset(req(BASE), PARAMS);
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ quantity: 1 }) })
    );
  });

  it("400s on a non-positive quantity", async () => {
    mockAuth.mockResolvedValue(session() as never);
    const res = await createAsset(req({ ...BASE, quantity: 0 }), PARAMS);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/locations/[id]/assets — audit entry", () => {
  it("names the asset with assetLabel and snapshots the same keys as a delete", async () => {
    mockCreate.mockResolvedValue({
      id: "a1", lineageId: "lin", quantity: 1, model: null, serialNumber: "SN1", hostname: "rec-01.example.org",
      type: { name: "Recorder" }, manufacturer: null, location: { name: "Room 1" },
    } as never);
    expect((await createAsset(req({ ...BASE }), PARAMS)).status).toBe(201);
    expect(vi.mocked(logAudit).mock.calls[0][0]).toMatchObject({
      entityName: "rec-01.example.org",
      detail: { snapshot: { Type: "Recorder", "Serial number": "SN1", Hostname: "rec-01.example.org", Location: "Room 1" } },
    });
  });
});
