import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  prisma: { stockItem: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() } },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { GET, PUT, DELETE } from "@/app/api/stock/[id]/route";

const mockAuth = vi.mocked(auth);
const mockLogAudit = vi.mocked(logAudit);
const session = (role = "ADMIN") => ({ user: { id: "u1", role, email: "a@b.com" } });
const params = (id = "s1") => Promise.resolve({ id });
const put = (body: object) => new NextRequest("http://localhost/api/stock/s1", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const del = () => new NextRequest("http://localhost/api/stock/s1", { method: "DELETE" });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/stock/[id]", () => {
  it("401 unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await GET(new NextRequest("http://x"), { params: params() })).status).toBe(401);
  });
  it("404 when missing", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    vi.mocked(prisma.stockItem.findUnique).mockResolvedValue(null as never);
    expect((await GET(new NextRequest("http://x"), { params: params() })).status).toBe(404);
  });
  it("returns the item", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    vi.mocked(prisma.stockItem.findUnique).mockResolvedValue({ id: "s1", model: { name: "X" } } as never);
    expect((await GET(new NextRequest("http://x"), { params: params() })).status).toBe(200);
  });
});

describe("PUT /api/stock/[id]", () => {
  it("403 for viewers", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    expect((await PUT(put({ modelId: "mo1" }), { params: params() })).status).toBe(403);
  });
  it("404 when the item does not exist", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.stockItem.findUnique).mockResolvedValue(null as never);
    expect((await PUT(put({ modelId: "mo1" }), { params: params() })).status).toBe(404);
  });
  it("400 when serial is set but quantity > 1 (superRefine)", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.stockItem.findUnique).mockResolvedValue({ id: "s1" } as never);
    expect((await PUT(put({ serialNumber: "SN", quantity: 5 }), { params: params() })).status).toBe(400);
  });
  it("updates fields, parses invoiceDate, and audits the changes", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    vi.mocked(prisma.stockItem.findUnique).mockResolvedValue({ id: "s1", modelId: "mo-old", model: { name: "Old" }, serialNumber: null, quantity: 1, notes: null, invoiceNumber: null } as never);
    vi.mocked(prisma.stockItem.update).mockResolvedValue({ id: "s1", modelId: "mo-new", model: { name: "New" } } as never);
    const res = await PUT(put({ modelId: "mo-new", quantity: 3, invoiceDate: "2024-01-01" }), { params: params() });
    expect(res.status).toBe(200);
    const updateArg = vi.mocked(prisma.stockItem.update).mock.calls[0][0];
    expect(updateArg.data.invoiceDate).toBeInstanceOf(Date);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "UPDATE",
        entityType: "StockItem",
        detail: { changes: expect.objectContaining({ Model: { from: "Old", to: "New" }, Quantity: { from: 1, to: 3 } }) },
      })
    );
  });
  it("nulls invoiceDate when passed null", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    vi.mocked(prisma.stockItem.findUnique).mockResolvedValue({ id: "s1", modelId: "mo-m", model: { name: "M" }, serialNumber: null, quantity: 1, notes: null, invoiceNumber: null } as never);
    vi.mocked(prisma.stockItem.update).mockResolvedValue({ id: "s1", modelId: "mo-m", model: { name: "M" } } as never);
    await PUT(put({ invoiceDate: null }), { params: params() });
    expect(vi.mocked(prisma.stockItem.update).mock.calls[0][0].data.invoiceDate).toBeNull();
  });
});

describe("DELETE /api/stock/[id]", () => {
  it("403 for viewers", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    expect((await DELETE(del(), { params: params() })).status).toBe(403);
  });
  it("404 when missing", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    vi.mocked(prisma.stockItem.findUnique).mockResolvedValue(null as never);
    expect((await DELETE(del(), { params: params() })).status).toBe(404);
  });
  it("deletes and audits", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    vi.mocked(prisma.stockItem.findUnique).mockResolvedValue({ model: { name: "X" } } as never);
    vi.mocked(prisma.stockItem.delete).mockResolvedValue({} as never);
    const res = await DELETE(del(), { params: params() });
    expect(res.status).toBe(200);
    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "DELETE", entityType: "StockItem", entityName: "X" }));
  });
});
