import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workLogItem: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { GET, POST } from "@/app/api/work-log-items/route";
import { PUT, DELETE } from "@/app/api/work-log-items/[id]/route";

const mockAuth = vi.mocked(auth);
const mockFindMany = vi.mocked(prisma.workLogItem.findMany);
const mockFindUnique = vi.mocked(prisma.workLogItem.findUnique);
const mockCreate = vi.mocked(prisma.workLogItem.create);
const mockUpdate = vi.mocked(prisma.workLogItem.update);
const mockDelete = vi.mocked(prisma.workLogItem.delete);

function admin() {
  return { user: { id: "u1", role: "ADMIN", name: "A", email: "a@x.com" } };
}
function viewer() {
  return { user: { id: "u2", role: "VIEWER", name: "V", email: "v@x.com" } };
}
function req(method: string, body?: object) {
  return new NextRequest("http://localhost/api/work-log-items", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}
const params = () => ({ params: Promise.resolve({ id: "wi1" }) });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/work-log-items", () => {
  it("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await GET()).status).toBe(401);
  });

  it("returns items for any authenticated user", async () => {
    mockAuth.mockResolvedValue(viewer() as never);
    mockFindMany.mockResolvedValue([
      { id: "wi1", name: "Review asset list", description: null, order: 0, _count: { workLogs: 2 } },
    ] as never);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json())[0].name).toBe("Review asset list");
  });
});

describe("POST /api/work-log-items", () => {
  it("403 for non-admin", async () => {
    mockAuth.mockResolvedValue(viewer() as never);
    expect((await POST(req("POST", { name: "X" }))).status).toBe(403);
  });

  it("400 on empty name", async () => {
    mockAuth.mockResolvedValue(admin() as never);
    expect((await POST(req("POST", { name: "" }))).status).toBe(400);
  });

  it("201 on valid create", async () => {
    mockAuth.mockResolvedValue(admin() as never);
    mockCreate.mockResolvedValue({ id: "wi1", name: "Review asset list", description: null } as never);
    const res = await POST(req("POST", { name: "Review asset list" }));
    expect(res.status).toBe(201);
  });

  it("409 on duplicate name", async () => {
    mockAuth.mockResolvedValue(admin() as never);
    mockCreate.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    expect((await POST(req("POST", { name: "dup" }))).status).toBe(409);
  });

  it("rethrows non-constraint database errors instead of reporting a duplicate", async () => {
    mockAuth.mockResolvedValue(admin() as never);
    mockCreate.mockRejectedValue(new Error("connection lost"));
    await expect(POST(req("POST", { name: "x" }))).rejects.toThrow("connection lost");
  });
});

describe("PUT /api/work-log-items/[id]", () => {
  it("403 for non-admin", async () => {
    mockAuth.mockResolvedValue(viewer() as never);
    expect((await PUT(req("PUT", { name: "X" }), params())).status).toBe(403);
  });

  it("404 when missing", async () => {
    mockAuth.mockResolvedValue(admin() as never);
    mockFindUnique.mockResolvedValue(null as never);
    expect((await PUT(req("PUT", { name: "X" }), params())).status).toBe(404);
  });

  it("updates name", async () => {
    mockAuth.mockResolvedValue(admin() as never);
    mockFindUnique.mockResolvedValue({ name: "old" } as never);
    mockUpdate.mockResolvedValue({ id: "wi1", name: "new", description: null } as never);
    const res = await PUT(req("PUT", { name: "new" }), params());
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("new");
  });
});

describe("DELETE /api/work-log-items/[id]", () => {
  it("403 for non-admin", async () => {
    mockAuth.mockResolvedValue(viewer() as never);
    expect((await DELETE(req("DELETE"), params())).status).toBe(403);
  });

  it("404 when missing", async () => {
    mockAuth.mockResolvedValue(admin() as never);
    mockFindUnique.mockResolvedValue(null as never);
    expect((await DELETE(req("DELETE"), params())).status).toBe(404);
  });

  it("deletes when present", async () => {
    mockAuth.mockResolvedValue(admin() as never);
    mockFindUnique.mockResolvedValue({ name: "Review asset list" } as never);
    mockDelete.mockResolvedValue({} as never);
    const res = await DELETE(req("DELETE"), params());
    expect(res.status).toBe(200);
    expect(mockDelete).toHaveBeenCalled();
  });
});
