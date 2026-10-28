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
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { POST } from "@/app/api/assets/bulk-return-to-stock/route";

const mockAuth = vi.mocked(auth);
const mockFindUnique = vi.mocked(prisma.asset.findUnique);
const mockLocationFindUnique = vi.mocked(prisma.location.findUnique);
const mockTransaction = vi.mocked(prisma.$transaction);
const mockLogAudit = vi.mocked(logAudit);

function session(role: "ADMIN" | "EDITOR" | "VIEWER") {
  return { user: { id: "u1", role, name: "T", email: "t@test.com" } };
}

function makeReq(body?: object) {
  return new NextRequest("http://localhost/api/assets/bulk-return-to-stock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const VALID_ASSET = {
  id: "ok-1",
  lineageId: "lin-1",
  modelId: "mo1",
  model: { name: "Dell Monitor" },
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
  mockTransaction.mockImplementation(async (fn) =>
    fn({
      stockItem: { create: vi.fn().mockResolvedValue({ id: "stock-1", model: "Dell Monitor" }) },
      asset: { delete: vi.fn().mockResolvedValue({}) },
    } as never)
  );
});

describe("POST /api/assets/bulk-return-to-stock", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await POST(makeReq({ ids: ["a1"], locationId: "loc-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for viewers", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    const res = await POST(makeReq({ ids: ["a1"], locationId: "loc-1" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for an empty ids array", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    const res = await POST(makeReq({ ids: [], locationId: "loc-1" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when ids exceeds the 200-item cap", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    const res = await POST(makeReq({ ids: Array.from({ length: 201 }, (_, i) => `id-${i}`), locationId: "loc-1" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when locationId is missing", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    const res = await POST(makeReq({ ids: ["a1"] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when the location does not exist", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockLocationFindUnique.mockResolvedValue(null as never);
    const res = await POST(makeReq({ ids: ["a1"], locationId: "bad-loc" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/location/i);
  });

  it("skip-and-reports not-found, missing-model, and already-decommissioned assets while succeeding on valid ones", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockFindUnique.mockImplementation((async ({ where: { id } }: { where: { id: string } }) => {
      if (id === "missing") return null;
      if (id === "no-model") return { ...VALID_ASSET, id, modelId: null, model: null };
      if (id === "already-done") return { ...VALID_ASSET, id, status: "DECOMMISSIONED" };
      return { ...VALID_ASSET, id };
    }) as never);

    const res = await POST(makeReq({ ids: ["ok-1", "missing", "no-model", "already-done"], locationId: "loc-1" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.succeeded).toEqual(["ok-1"]);
    expect(body.failed).toEqual(
      expect.arrayContaining([
        { id: "missing", reason: "NOT_FOUND" },
        { id: "no-model", reason: "MISSING_MODEL" },
        { id: "already-done", reason: "ALREADY_DECOMMISSIONED" },
      ])
    );
    // one $transaction call per succeeded item only
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    // two logAudit calls (DELETE/Asset + CREATE/StockItem) for the one success
    expect(mockLogAudit).toHaveBeenCalledTimes(2);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "Asset", action: "DELETE", lineageId: "lin-1" })
    );
  });
});
