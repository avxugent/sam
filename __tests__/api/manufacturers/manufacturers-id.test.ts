import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  prisma: {
    manufacturer: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    asset: { count: vi.fn() },
    model: { count: vi.fn() },
  },
}));
vi.mock("@/lib/auth", () => ({ __esModule: true, auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ __esModule: true, logAudit: vi.fn() }));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { POST } from "@/app/api/manufacturers/route";
import { PUT, DELETE } from "@/app/api/manufacturers/[id]/route";

const mockAuth = vi.mocked(auth);
const m = vi.mocked(prisma.manufacturer);

const session = (role: string) => ({ user: { id: "u1", role } }) as never;
const req = (method: string, body?: unknown) =>
  new NextRequest("http://localhost/api/manufacturers/m1", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
const params = { params: Promise.resolve({ id: "m1" }) };
const dup = () => Object.assign(new Error("dup"), { code: "P2002" });

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(session("MAINTAINER"));
});

describe("auth", () => {
  it.each([
    ["PUT", () => PUT(req("PUT", { name: "X" }), params)],
    ["DELETE", () => DELETE(req("DELETE"), params)],
  ])("%s: 401 without session, 403 for EDITOR", async (_m, call) => {
    mockAuth.mockResolvedValue(null as never);
    expect((await call()).status).toBe(401);
    mockAuth.mockResolvedValue(session("EDITOR"));
    expect((await call()).status).toBe(403);
  });
});

describe("POST /api/manufacturers", () => {
  it("400 for a name over 255 characters", async () => {
    expect((await POST(req("POST", { name: "x".repeat(256) }))).status).toBe(400);
    expect(m.create).not.toHaveBeenCalled();
  });

  it("409 on a duplicate name", async () => {
    m.create.mockRejectedValue(dup());
    expect((await POST(req("POST", { name: "Dell" }))).status).toBe(409);
  });

  it("rethrows unexpected database errors", async () => {
    m.create.mockRejectedValue(new Error("db down"));
    await expect(POST(req("POST", { name: "Dell" }))).rejects.toThrow("db down");
  });
});

describe("PUT /api/manufacturers/[id]", () => {
  it("400 on invalid input", async () => {
    expect((await PUT(req("PUT", { name: "" }), params)).status).toBe(400);
  });

  it("409 with merge hints when another manufacturer has the name", async () => {
    m.findFirst.mockResolvedValue({ id: "m2", name: "Dell", _count: { assets: 4 } } as never);
    const res = await PUT(req("PUT", { name: "Dell" }), params);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ existingId: "m2", existingAssetCount: 4 });
  });

  it("404 when the manufacturer does not exist", async () => {
    m.findFirst.mockResolvedValue(null as never);
    m.update.mockRejectedValue(Object.assign(new Error("missing"), { code: "P2025" }));
    expect((await PUT(req("PUT", { name: "Dell" }), params)).status).toBe(404);
  });

  it("renames and audits the change", async () => {
    m.findFirst.mockResolvedValue(null as never);
    m.findUnique.mockResolvedValue({ name: "Del" } as never);
    m.update.mockResolvedValue({ id: "m1", name: "Dell" } as never);
    expect((await PUT(req("PUT", { name: "Dell" }), params)).status).toBe(200);
    expect(vi.mocked(logAudit).mock.calls[0][0].detail).toEqual({ changes: { Name: { from: "Del", to: "Dell" } } });
  });
});

describe("DELETE /api/manufacturers/[id]", () => {
  it("404 when the manufacturer does not exist", async () => {
    m.findUnique.mockResolvedValue(null as never);
    expect((await DELETE(req("DELETE"), params)).status).toBe(404);
  });

  it("400 while assets or models still reference it", async () => {
    m.findUnique.mockResolvedValue({ name: "Dell" } as never);
    vi.mocked(prisma.asset.count).mockResolvedValue(2 as never);
    expect((await DELETE(req("DELETE"), params)).status).toBe(400);
    vi.mocked(prisma.asset.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.model.count).mockResolvedValue(1 as never);
    expect((await DELETE(req("DELETE"), params)).status).toBe(400);
    expect(m.delete).not.toHaveBeenCalled();
  });

  it("deletes an unused manufacturer and audits it", async () => {
    m.findUnique.mockResolvedValue({ name: "Dell" } as never);
    vi.mocked(prisma.asset.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.model.count).mockResolvedValue(0 as never);
    expect((await DELETE(req("DELETE"), params)).status).toBe(200);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "DELETE", entityName: "Dell" }));
  });
});
