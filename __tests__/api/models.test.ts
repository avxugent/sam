import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    model: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    assetType: { findUnique: vi.fn() },
    manufacturer: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { GET, POST } from "@/app/api/models/route";

const mockAuth = vi.mocked(auth);
const mockFindMany = vi.mocked(prisma.model.findMany);
const mockFindFirst = vi.mocked(prisma.model.findFirst);
const mockCreate = vi.mocked(prisma.model.create);
const mockTypeFindUnique = vi.mocked(prisma.assetType.findUnique);
const mockMfrFindUnique = vi.mocked(prisma.manufacturer.findUnique);

const session = (role = "VIEWER") => ({ user: { id: "u1", role, email: "u@test.com" } });

function getReq(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/models");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url);
}
function postReq(body: object) {
  return new NextRequest("http://localhost/api/models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFindMany.mockResolvedValue([]);
});

describe("GET /api/models", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await GET(getReq());
    expect(res.status).toBe(401);
  });

  it("returns models scoped by type/manufacturer, flattened with type/manufacturer names", async () => {
    mockAuth.mockResolvedValue(session() as never);
    mockFindMany.mockResolvedValue([
      {
        id: "mo1",
        name: "UltraSharp U2722D",
        typeId: "t1",
        manufacturerId: "m1",
        type: { name: "Monitor" },
        manufacturer: { name: "Dell" },
      },
    ] as never);

    const res = await GET(getReq({ typeId: "t1", manufacturerId: "m1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      { id: "mo1", name: "UltraSharp U2722D", typeId: "t1", manufacturerId: "m1", typeName: "Monitor", manufacturerName: "Dell" },
    ]);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { typeId: "t1", manufacturerId: "m1" } })
    );
  });

  it("applies the search term as a name filter", async () => {
    mockAuth.mockResolvedValue(session() as never);
    await GET(getReq({ q: "Dell" }));
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ name: { contains: "Dell" } }) })
    );
  });
});

describe("POST /api/models", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await POST(postReq({ typeId: "t1", name: "UltraSharp U2722D" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin roles", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    const res = await POST(postReq({ typeId: "t1", name: "UltraSharp U2722D" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 on invalid input", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    const res = await POST(postReq({ typeId: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the asset type doesn't exist", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    mockTypeFindUnique.mockResolvedValue(null as never);
    const res = await POST(postReq({ typeId: "missing", name: "X" }));
    expect(res.status).toBe(404);
  });

  it("returns 409 when a model with the same type/manufacturer/name already exists", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    mockTypeFindUnique.mockResolvedValue({ name: "Monitor" } as never);
    mockFindFirst.mockResolvedValue({ id: "existing1", name: "UltraSharp U2722D" } as never);

    const res = await POST(postReq({ typeId: "t1", name: "UltraSharp U2722D" }));
    expect(res.status).toBe(409);
  });

  it("creates the model without documentation and audits on success", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    mockTypeFindUnique.mockResolvedValue({ name: "Monitor" } as never);
    mockMfrFindUnique.mockResolvedValue({ name: "Dell" } as never);
    mockFindFirst.mockResolvedValue(null as never);
    mockCreate.mockResolvedValue({ id: "mo1", typeId: "t1", manufacturerId: "m1", name: "UltraSharp U2722D", documentationUrl: null } as never);

    const res = await POST(postReq({ typeId: "t1", manufacturerId: "m1", name: "UltraSharp U2722D" }));
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith({ data: { typeId: "t1", manufacturerId: "m1", name: "UltraSharp U2722D", documentationUrl: null } });
  });

  it("passes documentationUrl through when provided", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    mockTypeFindUnique.mockResolvedValue({ name: "Monitor" } as never);
    mockFindFirst.mockResolvedValue(null as never);
    mockCreate.mockResolvedValue({ id: "mo1", typeId: "t1", manufacturerId: null, name: "UltraSharp U2722D", documentationUrl: "https://docs.example.com/u2722d" } as never);

    const res = await POST(postReq({ typeId: "t1", name: "UltraSharp U2722D", documentationUrl: "https://docs.example.com/u2722d" }));
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith({
      data: { typeId: "t1", manufacturerId: null, name: "UltraSharp U2722D", documentationUrl: "https://docs.example.com/u2722d" },
    });
  });

  it("returns 400 when documentationUrl is not a valid URL", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    const res = await POST(postReq({ typeId: "t1", name: "UltraSharp U2722D", documentationUrl: "not-a-url" }));
    expect(res.status).toBe(400);
  });
});
