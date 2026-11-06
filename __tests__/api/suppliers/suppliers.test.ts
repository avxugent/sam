import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  prisma: {
    supplier: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    asset: { count: vi.fn() },
  },
}));
vi.mock("@/lib/auth", () => ({ __esModule: true, auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ __esModule: true, logAudit: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { GET, POST } from "@/app/api/suppliers/route";
import { PUT, DELETE } from "@/app/api/suppliers/[id]/route";
import { NextRequest } from "next/server";

const mockAuth = vi.mocked(auth);
const mockFindMany = vi.mocked(prisma.supplier.findMany);
const mockFindUnique = vi.mocked(prisma.supplier.findUnique);
const mockCreate = vi.mocked(prisma.supplier.create);
const mockUpdate = vi.mocked(prisma.supplier.update);
const mockDelete = vi.mocked(prisma.supplier.delete);
const mockAssetCount = vi.mocked(prisma.asset.count);
const mockLogAudit = vi.mocked(logAudit);

function session(role: string) {
  return { user: { id: "u1", email: "a@b.c", role } } as never;
}

function jsonReq(method: string, body: unknown) {
  return new NextRequest("http://localhost/api/suppliers", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  mockFindMany.mockResolvedValue([] as never);
  mockAssetCount.mockResolvedValue(0 as never);
});

describe("GET /api/suppliers", () => {
  it("401 unauthenticated; 200 for any authenticated role", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await GET()).status).toBe(401);
    mockAuth.mockResolvedValue(session("VIEWER"));
    mockFindMany.mockResolvedValue([{ id: "s1", name: "X", _count: { assets: 2 } }] as never);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(1);
  });
});

describe("POST /api/suppliers", () => {
  it("403 for EDITOR", async () => {
    mockAuth.mockResolvedValue(session("EDITOR"));
    expect((await POST(jsonReq("POST", { name: "X" }))).status).toBe(403);
  });

  it("allows MAINTAINER", async () => {
    mockAuth.mockResolvedValue(session("MAINTAINER"));
    mockCreate.mockResolvedValue({ id: "s1", name: "X" } as never);
    expect((await POST(jsonReq("POST", { name: "X" }))).status).not.toBe(403);
  });

  it("400 on invalid input (empty name, bad date, until before from, until without from)", async () => {
    mockAuth.mockResolvedValue(session("ADMIN"));
    expect((await POST(jsonReq("POST", { name: "" }))).status).toBe(400);
    expect((await POST(jsonReq("POST", { name: "X", defaultFrom: "07/01/2026" }))).status).toBe(400);
    expect((await POST(jsonReq("POST", { name: "X", defaultFrom: "2026-07-02", defaultUntil: "2026-07-01" }))).status).toBe(400);
    expect((await POST(jsonReq("POST", { name: "X", defaultUntil: "2026-07-01" }))).status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("201 creates supplier and logs CREATE", async () => {
    mockAuth.mockResolvedValue(session("ADMIN"));
    mockCreate.mockResolvedValue({ id: "s1", name: "X" } as never);
    const res = await POST(jsonReq("POST", { name: "X", contractReference: "FW-1", defaultFrom: "2026-07-01" }));
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "X",
          contractReference: "FW-1",
          defaultFrom: new Date("2026-07-01"),
          defaultUntil: null,
        }),
      })
    );
    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "CREATE", entityType: "Supplier" }));
  });

  it("400 supplierWindowOverlap when another supplier's window overlaps", async () => {
    mockAuth.mockResolvedValue(session("ADMIN"));
    mockFindMany.mockResolvedValue([
      { id: "s2", name: "Other", defaultFrom: new Date("2026-01-01"), defaultUntil: null },
    ] as never);
    const res = await POST(jsonReq("POST", { name: "X", defaultFrom: "2026-07-01", defaultUntil: "2026-07-31" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("supplierWindowOverlap");
    expect(body.details).toEqual(["Other"]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("409 on duplicate name (P2002)", async () => {
    mockAuth.mockResolvedValue(session("ADMIN"));
    mockCreate.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    expect((await POST(jsonReq("POST", { name: "X" }))).status).toBe(409);
  });
});

describe("PUT /api/suppliers/[id]", () => {
  it("401/403 without proper role", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await PUT(jsonReq("PUT", { name: "X" }), params("s1"))).status).toBe(401);
    mockAuth.mockResolvedValue(session("EDITOR"));
    expect((await PUT(jsonReq("PUT", { name: "X" }), params("s1"))).status).toBe(403);
  });

  it("allows MAINTAINER", async () => {
    mockAuth.mockResolvedValue(session("MAINTAINER"));
    expect((await PUT(jsonReq("PUT", { name: "X" }), params("s1"))).status).not.toBe(403);
  });

  it("404 when supplier does not exist", async () => {
    mockAuth.mockResolvedValue(session("ADMIN"));
    mockFindUnique.mockResolvedValue(null as never);
    expect((await PUT(jsonReq("PUT", { name: "X" }), params("nope"))).status).toBe(404);
  });

  it("404 when the supplier is deleted before the update", async () => {
    mockAuth.mockResolvedValue(session("ADMIN"));
    mockFindUnique.mockResolvedValue({ id: "s1", name: "Old" } as never);
    mockUpdate.mockRejectedValueOnce(Object.assign(new Error("missing"), { code: "P2025" }));
    expect((await PUT(jsonReq("PUT", { name: "X" }), params("s1"))).status).toBe(404);
  });

  it("updates and logs a change diff", async () => {
    mockAuth.mockResolvedValue(session("ADMIN"));
    mockFindUnique.mockResolvedValue({
      id: "s1", name: "Old", contractReference: null, contactInfo: null,
      defaultFrom: null, defaultUntil: null,
    } as never);
    mockUpdate.mockResolvedValue({
      id: "s1", name: "New", contractReference: "FW-9", contactInfo: null,
      defaultFrom: null, defaultUntil: null,
    } as never);
    const res = await PUT(jsonReq("PUT", { name: "New", contractReference: "FW-9" }), params("s1"));
    expect(res.status).toBe(200);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "UPDATE",
        entityType: "Supplier",
        detail: {
          changes: expect.objectContaining({
            Name: { from: "Old", to: "New" },
            "Contract reference": { from: "", to: "FW-9" },
          }),
        },
      })
    );
  });

  it("overlap check excludes the supplier being updated", async () => {
    mockAuth.mockResolvedValue(session("ADMIN"));
    mockFindUnique.mockResolvedValue({
      id: "s1", name: "Self", contractReference: null, contactInfo: null,
      defaultFrom: new Date("2026-07-01"), defaultUntil: null,
    } as never);
    // findConflictingWindows queries with NOT:{id:"s1"} — return no others
    mockFindMany.mockResolvedValue([] as never);
    mockUpdate.mockResolvedValue({
      id: "s1", name: "Self", contractReference: null, contactInfo: null,
      defaultFrom: new Date("2026-07-01"), defaultUntil: null,
    } as never);
    const res = await PUT(jsonReq("PUT", { name: "Self", defaultFrom: "2026-07-01" }), params("s1"));
    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ NOT: { id: "s1" } }) })
    );
  });
});

describe("DELETE /api/suppliers/[id]", () => {
  it("400 when the supplier still has assets", async () => {
    mockAuth.mockResolvedValue(session("ADMIN"));
    mockAssetCount.mockResolvedValue(3 as never);
    const res = await DELETE(jsonReq("DELETE", {}), params("s1"));
    expect(res.status).toBe(400);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("deletes and logs when unused", async () => {
    mockAuth.mockResolvedValue(session("ADMIN"));
    mockAssetCount.mockResolvedValue(0 as never);
    mockFindUnique.mockResolvedValue({ name: "X" } as never);
    mockDelete.mockResolvedValue({} as never);
    const res = await DELETE(jsonReq("DELETE", {}), params("s1"));
    expect(res.status).toBe(200);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "s1" } });
    expect(mockLogAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "DELETE", entityType: "Supplier" }));
  });
});

describe("malformed JSON body", () => {
  it("POST returns 400 instead of throwing", async () => {
    mockAuth.mockResolvedValue(session("ADMIN"));
    const req = new NextRequest("http://localhost/api/suppliers", {
      method: "POST",
      body: "{oops",
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
