import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    assetType: { create: vi.fn() },
    location: { create: vi.fn() },
    manufacturer: { create: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
    report: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    asset: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/schemas/report", () => ({
  createReportSchema: { safeParse: (b: unknown) => ({ success: true, data: b }) },
  updateReportSchema: { safeParse: (b: unknown) => ({ success: true, data: b }) },
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { POST as createAssetType } from "@/app/api/asset-types/route";
import { POST as createLocation } from "@/app/api/locations/route";
import { POST as createManufacturer } from "@/app/api/manufacturers/route";
import { POST as mergeManufacturer } from "@/app/api/manufacturers/[id]/merge/route";
import { POST as createReport } from "@/app/api/reports/route";
import { PUT as updateReport, DELETE as deleteReport } from "@/app/api/reports/[id]/route";

const mockAuth = vi.mocked(auth);
const mockLogAudit = vi.mocked(logAudit);

function session(role: "ADMIN" | "EDITOR" | "VIEWER" = "ADMIN") {
  return { user: { id: "u1", role, name: "T", email: "t@test.com" } };
}

function req(url: string, body?: object, method = "POST") {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : "{}",
  });
}

beforeEach(() => vi.clearAllMocks());

describe("audit — asset type create", () => {
  it("logs CREATE on AssetType", async () => {
    mockAuth.mockResolvedValue(session() as never);
    vi.mocked(prisma.assetType.create).mockResolvedValue({ id: "at1", name: "Monitor" } as never);

    const res = await createAssetType(req("http://localhost/api/asset-types", { name: "Monitor" }));
    expect(res.status).toBe(201);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CREATE", entityType: "AssetType", entityId: "at1", entityName: "Monitor" })
    );
  });

  it("does not log when name conflicts", async () => {
    mockAuth.mockResolvedValue(session() as never);
    vi.mocked(prisma.assetType.create).mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    const res = await createAssetType(req("http://localhost/api/asset-types", { name: "Monitor" }));
    expect(res.status).toBe(409);
    expect(mockLogAudit).not.toHaveBeenCalled();
  });
});

describe("audit — location create", () => {
  it("logs CREATE on Location", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.location.create).mockResolvedValue({ id: "loc1", name: "Room 1" } as never);

    const res = await createLocation(req("http://localhost/api/locations", { name: "Room 1" }));
    expect(res.status).toBe(201);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CREATE", entityType: "Location", entityId: "loc1", entityName: "Room 1" })
    );
  });
});

describe("audit — manufacturer create", () => {
  it("logs CREATE on Manufacturer", async () => {
    mockAuth.mockResolvedValue(session() as never);
    vi.mocked(prisma.manufacturer.create).mockResolvedValue({ id: "m1", name: "Dell" } as never);

    const res = await createManufacturer(req("http://localhost/api/manufacturers", { name: "Dell" }));
    expect(res.status).toBe(201);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CREATE", entityType: "Manufacturer", entityId: "m1", entityName: "Dell" })
    );
  });
});

describe("audit — manufacturer merge", () => {
  it("logs DELETE on source with mergedInto detail", async () => {
    mockAuth.mockResolvedValue(session() as never);
    vi.mocked(prisma.manufacturer.findUnique)
      .mockResolvedValueOnce({ id: "m1", name: "Dell" } as never)
      .mockResolvedValueOnce({ id: "m2", name: "Dell Inc" } as never);
    vi.mocked(prisma.$transaction).mockResolvedValue({ movedCount: 3, stockMoved: 0, modelsMoved: 0, modelsFolded: 0 } as never);

    const res = await mergeManufacturer(
      req("http://localhost/api/manufacturers/m1/merge", { targetId: "m2" }),
      { params: Promise.resolve({ id: "m1" }) }
    );
    expect(res.status).toBe(200);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "DELETE",
        entityType: "Manufacturer",
        entityId: "m1",
        entityName: "Dell",
        detail: expect.objectContaining({ mergedInto: { id: "m2", name: "Dell Inc" }, assetsMoved: 3 }),
      })
    );
  });
});

describe("audit — report CRUD", () => {
  it("logs CREATE on Report", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.report.create).mockResolvedValue({ id: "r1", name: "Q1" } as never);

    const res = await createReport(
      req("http://localhost/api/reports", { name: "Q1", description: "", definition: {} })
    );
    expect(res.status).toBe(201);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CREATE", entityType: "Report", entityId: "r1", entityName: "Q1" })
    );
  });

  it("logs UPDATE on Report with name-change detail", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.report.findUnique).mockResolvedValue({ id: "r1", name: "Old" } as never);
    vi.mocked(prisma.report.update).mockResolvedValue({ id: "r1", name: "New" } as never);

    const res = await updateReport(
      req("http://localhost/api/reports/r1", { name: "New" }, "PUT"),
      { params: Promise.resolve({ id: "r1" }) }
    );
    expect(res.status).toBe(200);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "UPDATE",
        entityType: "Report",
        entityId: "r1",
        detail: { changes: { Name: { from: "Old", to: "New" } } },
      })
    );
  });

  it("logs DELETE on Report", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    vi.mocked(prisma.report.findUnique).mockResolvedValue({ id: "r1", name: "Q1" } as never);
    vi.mocked(prisma.report.delete).mockResolvedValue({ id: "r1" } as never);

    const res = await deleteReport(
      req("http://localhost/api/reports/r1", undefined, "DELETE"),
      { params: Promise.resolve({ id: "r1" }) }
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "DELETE", entityType: "Report", entityId: "r1", entityName: "Q1" })
    );
  });
});
