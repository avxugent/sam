import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/uploads/storage", () => ({ deleteStoredFiles: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    asset: { findUnique: vi.fn(), delete: vi.fn() },
    attachment: { findMany: vi.fn() },
    assetType: { findUnique: vi.fn() },
    supplier: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { deleteStoredFiles } from "@/lib/uploads/storage";
import { GET, PUT, DELETE } from "@/app/api/assets/[id]/route";

const mockAuth = vi.mocked(auth);
const findAsset = vi.mocked(prisma.asset.findUnique);
const mockAssetTypeFindUnique = vi.mocked(prisma.assetType.findUnique);
const mockTransaction = vi.mocked(prisma.$transaction);
const params = { params: Promise.resolve({ id: "a1" }) };
const MAC = ["AA:BB:CC:DD:EE:FF"];
const p2002 = () => Object.assign(new Error("Duplicate"), { code: "P2002" });

function req(method: string, body?: object) {
  return new NextRequest("http://localhost/api/assets/a1", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const BEFORE = {
  id: "a1",
  lineageId: "lin1",
  modelId: "m1",
  model: { name: "Pearl-2" },
  typeId: "t1",
  type: { name: "Recorder" },
  manufacturerId: null,
  manufacturer: null,
  supplierId: null,
  supplier: null,
  locationId: "l1",
  location: { name: "Room 1" },
  ownerId: null,
  criticality: null,
  quantity: 1,
  serialNumber: "SN1",
  hostname: null,
  invoiceNumber: null,
  notes: null,
  vaultPath: null,
  installationDate: null,
  invoiceDate: null,
  endOfSupportDate: null,
  macAddresses: [] as { address: string }[],
  customFields: [] as { key: string; value: string }[],
};

/** Runs the PUT transaction callback against a fake tx that echoes the update. */
function runTransaction(updated: object = {}) {
  const tx = {
    macAddress: { deleteMany: vi.fn(), createMany: vi.fn() },
    customField: { deleteMany: vi.fn(), createMany: vi.fn() },
    asset: { update: vi.fn(async () => ({ ...BEFORE, ...updated })) },
  };
  vi.mocked(prisma.$transaction).mockImplementation((async (fn: (t: typeof tx) => unknown) => fn(tx)) as never);
  return tx;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "u1", role: "EDITOR" } } as never);
  findAsset.mockResolvedValue(BEFORE as never);
  vi.mocked(prisma.attachment.findMany).mockResolvedValue([] as never);
});

describe("GET /api/assets/[id]", () => {
  it("401 without a session", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await GET(req("GET"), params)).status).toBe(401);
  });

  it("404 for an unknown asset", async () => {
    findAsset.mockResolvedValue(null as never);
    expect((await GET(req("GET"), params)).status).toBe(404);
  });

  it("returns the asset", async () => {
    expect(await (await GET(req("GET"), params)).json()).toMatchObject({ id: "a1" });
  });
});

describe("PUT /api/assets/[id]", () => {
  it("403 for a viewer", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u2", role: "VIEWER" } } as never);
    expect((await PUT(req("PUT", { notes: "x" }), params)).status).toBe(403);
  });

  it("400 for an unknown supplier", async () => {
    vi.mocked(prisma.supplier.findUnique).mockResolvedValue(null as never);
    const res = await PUT(req("PUT", { supplierId: "nope" }), params);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Supplier does not exist.", code: "unknownReference" });
  });

  it("404 for an unknown asset", async () => {
    findAsset.mockResolvedValue(null as never);
    expect((await PUT(req("PUT", { notes: "x" }), params)).status).toBe(404);
  });

  it("400 when quantity > 1 is combined with the existing serial number", async () => {
    expect((await PUT(req("PUT", { quantity: 3 }), params)).status).toBe(400);
  });

  it("409 when the hostname is already taken", async () => {
    vi.mocked(prisma.$transaction).mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    expect((await PUT(req("PUT", { hostname: "rec-01.example.org", macAddresses: ["AA:BB:CC:DD:EE:FF"] }), params)).status).toBe(409);
  });

  it("404 when the asset was deleted concurrently between read and update", async () => {
    vi.mocked(prisma.$transaction).mockRejectedValue(Object.assign(new Error("gone"), { code: "P2025" }));
    expect((await PUT(req("PUT", { notes: "x" }), params)).status).toBe(404);
  });

  it("accepts a hostname-only update when the asset already has a MAC", async () => {
    findAsset.mockResolvedValue({ ...BEFORE, serialNumber: null, macAddresses: [{ address: MAC[0] }] } as never);
    mockAssetTypeFindUnique.mockResolvedValue({ hostnamePattern: null } as never);
    runTransaction({ hostname: "rec-01.example.org" });
    expect((await PUT(req("PUT", { hostname: "rec-01.example.org" }), params)).status).toBe(200);
  });

  it("400 when a hostname is set on an asset without MACs, or the MACs of a hostname are cleared", async () => {
    mockAssetTypeFindUnique.mockResolvedValue({ hostnamePattern: null } as never);
    const res = await PUT(req("PUT", { hostname: "rec-01.example.org" }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/MAC address is required/);

    findAsset.mockResolvedValue({ ...BEFORE, hostname: "rec-01.example.org", macAddresses: [{ address: MAC[0] }] } as never);
    expect((await PUT(req("PUT", { macAddresses: [] }), params)).status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("replaces MACs and custom fields and audits only the changed fields", async () => {
    const tx = runTransaction({ notes: "new" });
    const res = await PUT(
      req("PUT", { notes: "new", macAddresses: ["AA:BB:CC:DD:EE:FF"], customFields: [{ key: "rack", value: "R1" }] }),
      params
    );
    expect(res.status).toBe(200);
    expect(tx.macAddress.createMany).toHaveBeenCalledWith({ data: [{ address: "AA:BB:CC:DD:EE:FF", assetId: "a1" }] });
    expect(tx.customField.createMany).toHaveBeenCalledWith({ data: [{ key: "rack", value: "R1", assetId: "a1" }] });
    const detail = vi.mocked(logAudit).mock.calls[0][0].detail as { changes: Record<string, unknown> };
    expect(Object.keys(detail.changes).sort()).toEqual(["Custom field: rack", "MAC addresses", "Notes"]);
  });

  it("leaves dates untouched when omitted and clears them when sent empty", async () => {
    const tx = runTransaction();
    await PUT(req("PUT", { invoiceDate: "" }), params);
    const data = tx.asset.update.mock.calls[0][0].data;
    expect(data.invoiceDate).toBeNull();
    expect(data.installationDate).toBeUndefined();
  });
});

describe("DELETE /api/assets/[id]", () => {
  it("404 for an unknown asset instead of a failed delete", async () => {
    findAsset.mockResolvedValue(null as never);
    expect((await DELETE(req("DELETE"), params)).status).toBe(404);
    expect(prisma.asset.delete).not.toHaveBeenCalled();
  });

  it("deletes and audits a snapshot", async () => {
    const res = await DELETE(req("DELETE"), params);
    expect(await res.json()).toEqual({ ok: true });
    expect(vi.mocked(logAudit).mock.calls[0][0]).toMatchObject({
      action: "DELETE",
      detail: { snapshot: { Model: "Pearl-2", "Serial number": "SN1", Type: "Recorder", Location: "Room 1" } },
    });
  });

  it("names a model-less asset in the audit entry by its hostname, as the UI does", async () => {
    findAsset.mockResolvedValue({ ...BEFORE, model: null, hostname: "rec-001.example.org" } as never);
    await DELETE(req("DELETE"), params);
    expect(vi.mocked(logAudit).mock.calls[0][0]).toMatchObject({ entityName: "rec-001.example.org" });
  });

  it("404 without an audit entry when the asset vanished between read and delete", async () => {
    vi.mocked(prisma.asset.delete).mockRejectedValueOnce(Object.assign(new Error("gone"), { code: "P2025" }));
    expect((await DELETE(req("DELETE"), params)).status).toBe(404);
    expect(logAudit).not.toHaveBeenCalled();
    expect(deleteStoredFiles).not.toHaveBeenCalled();
  });

  it("removes the stored files of the asset's file attachments after the delete", async () => {
    vi.mocked(prisma.attachment.findMany).mockResolvedValue([{ path: "assets/a1/x.pdf" }] as never);
    expect((await DELETE(req("DELETE"), params)).status).toBe(200);
    expect(prisma.attachment.findMany).toHaveBeenCalledWith({ where: { assetId: "a1", path: { not: null } }, select: { path: true } });
    expect(deleteStoredFiles).toHaveBeenCalledWith(["assets/a1/x.pdf"]);
  });

  it("rethrows other delete errors", async () => {
    vi.mocked(prisma.asset.delete).mockRejectedValueOnce(new Error("boom"));
    await expect(DELETE(req("DELETE"), params)).rejects.toThrow("boom");
  });
});

describe("PUT /api/assets/[id] — hostname format & uniqueness", () => {
  const EXISTING = {
    id: "asset-1",
    quantity: 1,
    typeId: "t1",
    hostname: "old.example.com",
    macAddresses: [{ address: "AA:BB:CC:DD:EE:FF" }],
    customFields: [],
    type: { name: "Recorder" },
    manufacturer: { name: "Epson" },
    location: { name: "Room 1" },
  };

  it("re-validates hostname when it changes and rejects a bad format", async () => {
    findAsset.mockResolvedValue(EXISTING as never);
    mockAssetTypeFindUnique.mockResolvedValue({ hostnamePattern: null } as never);
    const res = await PUT(req("PUT", { hostname: "not-an-fqdn", macAddresses: MAC }), params);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/required format/i);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("re-validates against the new type's pattern when typeId changes", async () => {
    findAsset.mockResolvedValue(EXISTING as never);
    mockAssetTypeFindUnique.mockResolvedValue({ hostnamePattern: "^new-\\d{3}$" } as never);
    const res = await PUT(req("PUT", { typeId: "t2" }), params);
    expect(res.status).toBe(400);
    expect(mockAssetTypeFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "t2" } }));
  });

  it("does not re-validate hostname when neither hostname nor typeId is part of the update", async () => {
    findAsset.mockResolvedValue(EXISTING as never);
    mockTransaction.mockResolvedValue({ id: "asset-1", notes: "updated" } as never);
    const res = await PUT(req("PUT", { notes: "updated" }), params);
    expect(res.status).toBe(200);
    expect(mockAssetTypeFindUnique).not.toHaveBeenCalled();
  });

  it("accepts a hostname change that matches the current type's pattern", async () => {
    findAsset.mockResolvedValue(EXISTING as never);
    mockAssetTypeFindUnique.mockResolvedValue({ hostnamePattern: "^rec-\\d{3}$" } as never);
    mockTransaction.mockResolvedValue({ id: "asset-1", hostname: "rec-002" } as never);
    const res = await PUT(req("PUT", { hostname: "rec-002", macAddresses: MAC }), params);
    expect(res.status).toBe(200);
  });

  it("returns 409 when the new hostname collides with another asset", async () => {
    findAsset.mockResolvedValue(EXISTING as never);
    mockAssetTypeFindUnique.mockResolvedValue({ hostnamePattern: null } as never);
    mockTransaction.mockRejectedValue(p2002());
    const res = await PUT(req("PUT", { hostname: "device.example.com", macAddresses: MAC }), params);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already assigned/i);
  });
});

describe("PUT /api/assets/[id] — MAC address normalization", () => {
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
    findAsset.mockResolvedValue(EXISTING as never);
    const createMany = vi.fn();
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        macAddress: { deleteMany: vi.fn(), createMany },
        customField: { deleteMany: vi.fn(), createMany: vi.fn() },
        asset: { update: vi.fn().mockResolvedValue({ id: "asset-1" }) },
      };
      return cb(tx);
    });
    const res = await PUT(req("PUT", { macAddresses: ["aabb.ccdd.eeff"] }), params);
    expect(res.status).toBe(200);
    expect(createMany).toHaveBeenCalledWith({
      data: [{ assetId: "a1", address: "AA:BB:CC:DD:EE:FF" }],
    });
  });

  it("rejects an unrecoverable MAC address on update", async () => {
    findAsset.mockResolvedValue(EXISTING as never);
    const res = await PUT(req("PUT", { macAddresses: ["not-a-mac"] }), params);
    expect(res.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

describe("PUT /api/assets/[id] — quantity", () => {
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
    findAsset.mockResolvedValue(BULK_EXISTING as never);
    mockTransaction.mockResolvedValue({ id: "asset-1", quantity: 8 } as never);
    const res = await PUT(req("PUT", { quantity: 8 }), params);
    expect(res.status).toBe(200);
  });

  it("400s raising quantity in the same request a serial number is set", async () => {
    findAsset.mockResolvedValue(BULK_EXISTING as never);
    const res = await PUT(
      req("PUT", { serialNumber: "SN-NEW", quantity: 4 }),
      params
    );
    expect(res.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("400s raising quantity via a partial update that omits the existing serial number", async () => {
    // The asset already has a serial number; a request that only touches
    // quantity must still be rejected using the persisted (before) state.
    findAsset.mockResolvedValue(IDENTIFIED_EXISTING as never);
    const res = await PUT(req("PUT", { quantity: 5 }), params);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/quantity must be 1/i);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("does not re-check quantity when neither quantity nor identity fields are part of the update", async () => {
    findAsset.mockResolvedValue(IDENTIFIED_EXISTING as never);
    mockTransaction.mockResolvedValue({ id: "asset-1", notes: "updated" } as never);
    const res = await PUT(req("PUT", { notes: "updated" }), params);
    expect(res.status).toBe(200);
  });

  it("allows clearing the serial number and raising quantity in the same request", async () => {
    findAsset.mockResolvedValue(IDENTIFIED_EXISTING as never);
    mockTransaction.mockResolvedValue({ id: "asset-1", quantity: 4, serialNumber: null } as never);
    const res = await PUT(
      req("PUT", { serialNumber: null, quantity: 4 }),
      params
    );
    expect(res.status).toBe(200);
  });
});
