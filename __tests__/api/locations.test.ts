import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    location: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    stockItem: { count: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { GET as listGET, POST } from "@/app/api/locations/route";
import { GET, PUT, DELETE } from "@/app/api/locations/[id]/route";

const mockAuth = vi.mocked(auth);
const mockFindMany = vi.mocked(prisma.location.findMany);
const mockFindUnique = vi.mocked(prisma.location.findUnique);
const mockCreate = vi.mocked(prisma.location.create);
const mockUpdate = vi.mocked(prisma.location.update);
const mockDelete = vi.mocked(prisma.location.delete);
const mockCount = vi.mocked(prisma.location.count);

function session(role: "ADMIN" | "EDITOR" | "VIEWER") {
  return { user: { id: "u1", role, name: "User", email: "user@test.com" } };
}
function makeReq(method: string, body?: object) {
  return new NextRequest("http://localhost/api/locations", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}
function makeIdReq(method: string, body?: object) {
  return new NextRequest("http://localhost/api/locations/loc-1", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ── GET /api/locations ────────────────────────────────────────────────────────

describe("GET /api/locations", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await listGET();
    expect(res.status).toBe(401);
  });

  it("returns the location tree", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    mockFindMany.mockResolvedValue([
      { id: "loc-1", name: "Campus A", children: [], _count: { assets: 10, children: 2 } },
    ] as never);
    const res = await listGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0].name).toBe("Campus A");
  });
});

// ── POST /api/locations ───────────────────────────────────────────────────────

describe("POST /api/locations", () => {
  it("returns 403 for viewers", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    const res = await POST(makeReq("POST", { name: "Room 101" }));
    expect(res.status).toBe(403);
  });

  it("creates a location as editor", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockCreate.mockResolvedValue({
      id: "loc-2", name: "Room 101", parentId: null, fiNumber: null,
    } as never);
    const res = await POST(makeReq("POST", { name: "Room 101" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("Room 101");
  });

  it("returns 400 for empty name", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    const res = await POST(makeReq("POST", { name: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid FI number format", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    const res = await POST(makeReq("POST", { name: "Room", fiNumber: "1.2.3" }));
    expect(res.status).toBe(400);
  });

  it("accepts a valid FI number", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    mockCreate.mockResolvedValue({
      id: "loc-3", name: "Room 013", fiNumber: "14.10.100.013",
    } as never);
    const res = await POST(makeReq("POST", { name: "Room 013", fiNumber: "14.10.100.013" }));
    expect(res.status).toBe(201);
  });

  it("returns 409 on duplicate FI number (P2002)", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    const err = Object.assign(new Error("Unique constraint"), { code: "P2002" });
    mockCreate.mockRejectedValue(err);
    const res = await POST(makeReq("POST", { name: "Room", fiNumber: "14.10.100.013" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/FI number/);
  });
});

// ── GET /api/locations/[id] ───────────────────────────────────────────────────

describe("GET /api/locations/[id]", () => {
  const params = Promise.resolve({ id: "loc-1" });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const req = makeIdReq("GET");
    const res = await GET(req, { params });
    expect(res.status).toBe(401);
  });

  it("returns 404 when location does not exist", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    mockFindUnique.mockResolvedValue(null);
    const res = await GET(makeIdReq("GET"), { params });
    expect(res.status).toBe(404);
  });

  it("returns the location when found", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    mockFindUnique.mockResolvedValue({
      id: "loc-1", name: "Campus A", parent: null, children: [], _count: { assets: 0, children: 0, attachments: 0 },
    } as never);
    const res = await GET(makeIdReq("GET"), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Campus A");
  });
});

// ── PUT /api/locations/[id] ───────────────────────────────────────────────────

describe("PUT /api/locations/[id]", () => {
  const params = Promise.resolve({ id: "loc-1" });

  it("returns 403 for viewers", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    const res = await PUT(makeIdReq("PUT", { name: "Updated" }), { params });
    expect(res.status).toBe(403);
  });

  it("updates a location as editor", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    mockUpdate.mockResolvedValue({ id: "loc-1", name: "Updated" } as never);
    const res = await PUT(makeIdReq("PUT", { name: "Updated" }), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Updated");
  });

  it("rejects invalid coverImageId not owned by this location", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    // Mock prisma.attachment.findUnique for coverImageId validation
    vi.mocked(prisma as unknown as { attachment: { findUnique: ReturnType<typeof vi.fn> } })
    .attachment = { findUnique: vi.fn().mockResolvedValue(null) };
    // Re-import to pick up the mock — just check we get a 400
    const res = await PUT(makeIdReq("PUT", { coverImageId: "nonexistent-attach" }), { params });
    // The route handler checks if the attachment exists and belongs to this location
    expect(res.status).toBe(400);
  });
});

// ── DELETE /api/locations/[id] ────────────────────────────────────────────────

describe("DELETE /api/locations/[id]", () => {
  const params = Promise.resolve({ id: "loc-1" });

  it("returns 403 for viewers", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    const res = await DELETE(makeIdReq("DELETE"), { params });
    expect(res.status).toBe(403);
  });

  it("returns 400 when location has children", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    mockCount.mockResolvedValue(2);
    const res = await DELETE(makeIdReq("DELETE"), { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("HAS_SUBLOCATIONS");
  });

  it("deletes location when no children exist", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    mockCount.mockResolvedValue(0);
    mockDelete.mockResolvedValue({ id: "loc-1" } as never);
    const res = await DELETE(makeIdReq("DELETE"), { params });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it("cascade-deletes the subtree when cascade=true and children exist", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    mockCount.mockResolvedValue(2);
    mockFindUnique.mockResolvedValue({ name: "Building", fiNumber: null, address: null, city: null, country: null } as never);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { id: "child-1", depth: 1 },
      { id: "loc-1", depth: 0 },
    ] as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([] as never);
    const req = new NextRequest("http://localhost/api/locations/loc-1?cascade=true", { method: "DELETE" });
    const res = await DELETE(req, { params });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
