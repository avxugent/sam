import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    asset: { findUnique: vi.fn(), delete: vi.fn() },
    assetType: { findUnique: vi.fn() },
    supplier: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { GET, PUT, DELETE } from "@/app/api/assets/[id]/route";

const mockAuth = vi.mocked(auth);
const findAsset = vi.mocked(prisma.asset.findUnique);
const params = { params: Promise.resolve({ id: "a1" }) };

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
    expect((await res.json()).error).toBe("Unknown supplier.");
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
});
