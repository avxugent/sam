import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    model: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
    asset: { count: vi.fn() },
    stockItem: { count: vi.fn() },
  },
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { PUT, DELETE } from "@/app/api/models/[id]/route";

const mockAuth = vi.mocked(auth);
const mockFindUnique = vi.mocked(prisma.model.findUnique);
const mockFindFirst = vi.mocked(prisma.model.findFirst);
const mockUpdate = vi.mocked(prisma.model.update);
const mockDelete = vi.mocked(prisma.model.delete);
const mockAssetCount = vi.mocked(prisma.asset.count);
const mockStockCount = vi.mocked(prisma.stockItem.count);

const session = (role = "ADMIN") => ({ user: { id: "u1", role, email: "a@b.com" } });
const params = (id = "mo1") => Promise.resolve({ id });
function put(body: object) {
  return new NextRequest("http://localhost/api/models/mo1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function del() {
  return new NextRequest("http://localhost/api/models/mo1", { method: "DELETE" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAssetCount.mockResolvedValue(0);
  mockStockCount.mockResolvedValue(0);
});

describe("PUT /api/models/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await PUT(put({ typeId: "t1", name: "X" }), { params: params() });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin roles", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    const res = await PUT(put({ typeId: "t1", name: "X" }), { params: params() });
    expect(res.status).toBe(403);
  });

  it("allows MAINTAINER", async () => {
    mockAuth.mockResolvedValue(session("MAINTAINER") as never);
    const res = await PUT(put({ typeId: "t1", name: "X" }), { params: params() });
    expect(res.status).not.toBe(403);
  });

  it("returns 400 on invalid input", async () => {
    mockAuth.mockResolvedValue(session() as never);
    const res = await PUT(put({ typeId: "" }), { params: params() });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the model doesn't exist", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockFindUnique.mockResolvedValue(null as never);
    mockFindFirst.mockResolvedValue(null as never);
    const res = await PUT(put({ typeId: "t1", name: "X" }), { params: params() });
    expect(res.status).toBe(404);
  });

  it("returns 409 with usage counts when the rename collides with another model", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockFindUnique.mockResolvedValue({ typeId: "t1", manufacturerId: "m1", name: "Old" } as never);
    mockFindFirst.mockResolvedValue({
      id: "mo2",
      name: "New",
      _count: { assets: 2, stockItems: 1 },
    } as never);

    const res = await PUT(put({ typeId: "t1", manufacturerId: "m1", name: "New" }), { params: params() });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toMatchObject({ existingId: "mo2", existingName: "New", existingAssetCount: 2, existingStockCount: 1 });
  });

  it("updates the model and audits on success", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockFindUnique.mockResolvedValue({ typeId: "t1", manufacturerId: "m1", name: "Old", documentationUrl: null } as never);
    mockFindFirst.mockResolvedValue(null as never);
    mockUpdate.mockResolvedValue({ id: "mo1", typeId: "t1", manufacturerId: "m1", name: "New", documentationUrl: null } as never);

    const res = await PUT(put({ typeId: "t1", manufacturerId: "m1", name: "New" }), { params: params() });
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "mo1" },
      data: { typeId: "t1", manufacturerId: "m1", name: "New", documentationUrl: null },
    });
  });

  it.each([
    ["P2025", 404, undefined],
    ["P2002", 409, undefined],
    ["P2003", 400, "unknownReference"],
  ])("maps a %s error from a racing update to %i", async (code, status, errorCode) => {
    mockAuth.mockResolvedValue(session() as never);
    mockFindUnique.mockResolvedValue({ typeId: "t1", manufacturerId: "m1", name: "Old", documentationUrl: null } as never);
    mockFindFirst.mockResolvedValue(null as never);
    mockUpdate.mockRejectedValue(Object.assign(new Error(code), { code }));
    const res = await PUT(put({ typeId: "t1", manufacturerId: "m1", name: "New" }), { params: params() });
    expect(res.status).toBe(status);
    expect((await res.json()).code).toBe(errorCode);
  });

  it("updates documentationUrl and records it in the audit diff", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockFindUnique.mockResolvedValue({ typeId: "t1", manufacturerId: "m1", name: "Old", documentationUrl: null } as never);
    mockFindFirst.mockResolvedValue(null as never);
    mockUpdate.mockResolvedValue({
      id: "mo1", typeId: "t1", manufacturerId: "m1", name: "Old", documentationUrl: "https://docs.example.com/old",
    } as never);

    const res = await PUT(
      put({ typeId: "t1", manufacturerId: "m1", name: "Old", documentationUrl: "https://docs.example.com/old" }),
      { params: params() }
    );
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "mo1" },
      data: { typeId: "t1", manufacturerId: "m1", name: "Old", documentationUrl: "https://docs.example.com/old" },
    });
  });

  it("returns 400 when documentationUrl is not a valid URL", async () => {
    mockAuth.mockResolvedValue(session() as never);
    const res = await PUT(put({ typeId: "t1", name: "X", documentationUrl: "not-a-url" }), { params: params() });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/models/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await DELETE(del(), { params: params() })).status).toBe(401);
  });

  it("returns 403 for non-admin roles", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    expect((await DELETE(del(), { params: params() })).status).toBe(403);
  });

  it("allows MAINTAINER", async () => {
    mockAuth.mockResolvedValue(session("MAINTAINER") as never);
    expect((await DELETE(del(), { params: params() })).status).not.toBe(403);
  });

  it("returns 404 when the model doesn't exist", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockFindUnique.mockResolvedValue(null as never);
    const res = await DELETE(del(), { params: params() });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Model not found." });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("returns 400 when the model is still used by assets or stock items", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockFindUnique.mockResolvedValue({ name: "M" } as never);
    mockAssetCount.mockResolvedValue(2);
    mockStockCount.mockResolvedValue(1);
    const res = await DELETE(del(), { params: params() });
    expect(res.status).toBe(400);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("deletes the model and audits when unused", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockFindUnique.mockResolvedValue({ name: "UltraSharp U2722D" } as never);
    const res = await DELETE(del(), { params: params() });
    expect(res.status).toBe(200);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "mo1" } });
  });
});
