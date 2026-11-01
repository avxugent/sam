import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockLogAudit } = vi.hoisted(() => ({ mockLogAudit: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: mockLogAudit }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/reports/engine", () => ({
  runReport: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { runReport } from "@/lib/reports/engine";
import { GET as listGet, POST } from "@/app/api/reports/route";
import { GET as getOne, PUT, DELETE } from "@/app/api/reports/[id]/route";
import { GET as exportGet } from "@/app/api/reports/[id]/export/route";

const mockAuth = vi.mocked(auth);
const mockFindMany = vi.mocked(prisma.report.findMany);
const mockFindUnique = vi.mocked(prisma.report.findUnique);
const mockCreate = vi.mocked(prisma.report.create);
const mockUpdate = vi.mocked(prisma.report.update);
const mockDelete = vi.mocked(prisma.report.delete);
const mockRunReport = vi.mocked(runReport);

function adminSession() {
  return { user: { id: "u1", role: "ADMIN", email: "admin@test.com" } };
}
function editorSession() {
  return { user: { id: "u2", role: "EDITOR", email: "editor@test.com" } };
}
function viewerSession() {
  return { user: { id: "u3", role: "VIEWER", email: "viewer@test.com" } };
}

const VALID_DEFINITION = {
  source: "asset",
  filters: [],
  groupBy: "none",
  columns: ["model", "type"],
};

const SAMPLE_REPORT = {
  id: "r1",
  name: "Test Report",
  description: null,
  definition: JSON.stringify(VALID_DEFINITION),
  createdById: "u1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeReq(url: string, method: string, body?: object) {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => { vi.clearAllMocks(); });

// ── GET /api/reports ─────────────────────────────────────────────────────────

describe("GET /api/reports", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await listGet();
    expect(res.status).toBe(401);
  });

  it("returns list for any authenticated user", async () => {
    mockAuth.mockResolvedValue(viewerSession() as never);
    mockFindMany.mockResolvedValue([SAMPLE_REPORT] as never);
    const res = await listGet();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });
});

// ── POST /api/reports ────────────────────────────────────────────────────────

describe("POST /api/reports", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await POST(makeReq("http://localhost/api/reports", "POST", { name: "x", definition: VALID_DEFINITION }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for VIEWER role", async () => {
    mockAuth.mockResolvedValue(viewerSession() as never);
    const res = await POST(makeReq("http://localhost/api/reports", "POST", { name: "x", definition: VALID_DEFINITION }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for missing name", async () => {
    mockAuth.mockResolvedValue(editorSession() as never);
    const res = await POST(makeReq("http://localhost/api/reports", "POST", { definition: VALID_DEFINITION }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid definition (missing columns)", async () => {
    mockAuth.mockResolvedValue(editorSession() as never);
    const res = await POST(makeReq("http://localhost/api/reports", "POST", {
      name: "Test",
      definition: { filters: [], groupBy: "none", columns: [] },
    }));
    expect(res.status).toBe(400);
  });

  it("creates report for EDITOR", async () => {
    mockAuth.mockResolvedValue(editorSession() as never);
    mockCreate.mockResolvedValue(SAMPLE_REPORT as never);
    const res = await POST(makeReq("http://localhost/api/reports", "POST", {
      name: "Test Report",
      definition: VALID_DEFINITION,
    }));
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledOnce();
  });
});

// ── GET /api/reports/[id] ────────────────────────────────────────────────────

describe("GET /api/reports/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    mockFindUnique.mockResolvedValue(SAMPLE_REPORT as never);
    const res = await getOne(makeReq("http://localhost/api/reports/r1", "GET"), { params: Promise.resolve({ id: "r1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown report", async () => {
    mockAuth.mockResolvedValue(viewerSession() as never);
    mockFindUnique.mockResolvedValue(null as never);
    const res = await getOne(makeReq("http://localhost/api/reports/r1", "GET"), { params: Promise.resolve({ id: "r1" }) });
    expect(res.status).toBe(404);
  });

  it("returns report for authenticated user", async () => {
    mockAuth.mockResolvedValue(viewerSession() as never);
    mockFindUnique.mockResolvedValue(SAMPLE_REPORT as never);
    const res = await getOne(makeReq("http://localhost/api/reports/r1", "GET"), { params: Promise.resolve({ id: "r1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe("r1");
  });
});

// ── PUT /api/reports/[id] ────────────────────────────────────────────────────

describe("PUT /api/reports/[id]", () => {
  it("returns 403 for VIEWER", async () => {
    mockAuth.mockResolvedValue(viewerSession() as never);
    mockFindUnique.mockResolvedValue(SAMPLE_REPORT as never);
    const res = await PUT(makeReq("http://localhost/api/reports/r1", "PUT", { name: "New" }), { params: Promise.resolve({ id: "r1" }) });
    expect(res.status).toBe(403);
  });

  it("updates report for EDITOR", async () => {
    mockAuth.mockResolvedValue(editorSession() as never);
    mockFindUnique.mockResolvedValue(SAMPLE_REPORT as never);
    mockUpdate.mockResolvedValue({ ...SAMPLE_REPORT, name: "Updated" } as never);
    const res = await PUT(makeReq("http://localhost/api/reports/r1", "PUT", { name: "Updated" }), { params: Promise.resolve({ id: "r1" }) });
    expect(res.status).toBe(200);
    expect(mockUpdate.mock.calls.at(-1)?.[0].data.definition).toBeUndefined();
  });

  it("stores a given definition as JSON text", async () => {
    mockAuth.mockResolvedValue(editorSession() as never);
    mockFindUnique.mockResolvedValue(SAMPLE_REPORT as never);
    mockUpdate.mockResolvedValue(SAMPLE_REPORT as never);
    const res = await PUT(makeReq("http://localhost/api/reports/r1", "PUT", { definition: VALID_DEFINITION }), { params: Promise.resolve({ id: "r1" }) });
    expect(res.status).toBe(200);
    expect(mockUpdate.mock.calls.at(-1)?.[0].data.definition).toBe(JSON.stringify(VALID_DEFINITION));
  });
});

// ── DELETE /api/reports/[id] ─────────────────────────────────────────────────

describe("DELETE /api/reports/[id]", () => {
  it("returns 403 for EDITOR", async () => {
    mockAuth.mockResolvedValue(editorSession() as never);
    mockFindUnique.mockResolvedValue(SAMPLE_REPORT as never);
    const res = await DELETE(makeReq("http://localhost/api/reports/r1", "DELETE"), { params: Promise.resolve({ id: "r1" }) });
    expect(res.status).toBe(403);
  });

  it("deletes for ADMIN", async () => {
    mockAuth.mockResolvedValue(adminSession() as never);
    mockFindUnique.mockResolvedValue(SAMPLE_REPORT as never);
    mockDelete.mockResolvedValue(SAMPLE_REPORT as never);
    const res = await DELETE(makeReq("http://localhost/api/reports/r1", "DELETE"), { params: Promise.resolve({ id: "r1" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

// ── GET /api/reports/[id]/export ─────────────────────────────────────────────

describe("GET /api/reports/[id]/export", () => {
  const params = Promise.resolve({ id: "r1" });
  const req = () => makeReq("http://localhost/api/reports/r1/export", "GET");
  const VALID_DEF = JSON.stringify({ source: "asset", filters: [], groupBy: "none", columns: ["model"] });

  it("401 unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await exportGet(req(), { params })).status).toBe(401);
  });
  it("404 when report missing", async () => {
    mockAuth.mockResolvedValue(viewerSession() as never);
    mockFindUnique.mockResolvedValue(null as never);
    expect((await exportGet(req(), { params })).status).toBe(404);
  });
  it("422 when the stored definition is invalid", async () => {
    mockAuth.mockResolvedValue(viewerSession() as never);
    mockFindUnique.mockResolvedValue({ id: "r1", name: "R", definition: "not json" } as never);
    expect((await exportGet(req(), { params })).status).toBe(422);
  });
  it("runs the report and streams CSV with a sanitized filename", async () => {
    mockAuth.mockResolvedValue(viewerSession() as never);
    mockFindUnique.mockResolvedValue({ id: "r1", name: "Q1 / Report!", definition: VALID_DEF } as never);
    mockRunReport.mockResolvedValue({ source: "asset", rows: [{ model: "XPS" }], groups: [], total: 1 } as never);
    const res = await exportGet(req(), { params });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="Q1___Report_.csv"');
    const body = await res.text();
    expect(body.split("\r\n")).toEqual(["Model", "XPS"]);
    // The download holds every matching row, not the on-screen cap.
    expect(mockRunReport).toHaveBeenCalledWith(expect.objectContaining({ source: "asset" }), { capRows: false });
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "EXPORT", entityType: "Report", entityId: "r1", entityName: "Q1 / Report!" })
    );
  });
});
