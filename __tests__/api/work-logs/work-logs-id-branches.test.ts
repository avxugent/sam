import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  prisma: { workLog: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() } },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { GET, PUT, DELETE } from "@/app/api/work-logs/[id]/route";

const mockAuth = vi.mocked(auth);
const mockLogAudit = vi.mocked(logAudit);
const session = (role = "ADMIN", id = "u1") => ({ user: { id, role, email: "a@b.com" } });
const params = (id = "w1") => Promise.resolve({ id });
const put = (body: object) => new NextRequest("http://localhost/api/work-logs/w1", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const del = () => new NextRequest("http://localhost/api/work-logs/w1", { method: "DELETE" });
const EXISTING = { id: "w1", performedById: "u1", description: "old", jiraIssueKey: null, performedAt: new Date("2024-01-01T00:00:00Z") };

beforeEach(() => vi.clearAllMocks());

describe("GET /api/work-logs/[id]", () => {
  it("401 unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await GET(new NextRequest("http://x"), { params: params() })).status).toBe(401);
  });
  it("404 when missing", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    vi.mocked(prisma.workLog.findUnique).mockResolvedValue(null as never);
    expect((await GET(new NextRequest("http://x"), { params: params() })).status).toBe(404);
  });
  it("returns the log", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    vi.mocked(prisma.workLog.findUnique).mockResolvedValue({ id: "w1" } as never);
    expect((await GET(new NextRequest("http://x"), { params: params() })).status).toBe(200);
  });
});

describe("PUT /api/work-logs/[id]", () => {
  it("404 when missing", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    vi.mocked(prisma.workLog.findUnique).mockResolvedValue(null as never);
    expect((await PUT(put({ description: "x" }), { params: params() })).status).toBe(404);
  });
  it("403 when neither author nor admin", async () => {
    mockAuth.mockResolvedValue(session("EDITOR", "other") as never);
    vi.mocked(prisma.workLog.findUnique).mockResolvedValue(EXISTING as never);
    expect((await PUT(put({ description: "x" }), { params: params() })).status).toBe(403);
  });
  it("403 for a viewer, even as the entry's performer", async () => {
    mockAuth.mockResolvedValue(session("VIEWER", "u1") as never);
    vi.mocked(prisma.workLog.findUnique).mockResolvedValue(EXISTING as never);
    expect((await PUT(put({ description: "x" }), { params: params() })).status).toBe(403);
    expect((await DELETE(del(), { params: params() })).status).toBe(403);
    expect(prisma.workLog.update).not.toHaveBeenCalled();
    expect(prisma.workLog.delete).not.toHaveBeenCalled();
  });
  it("400 unknownReference for a stale asset, item or performer id", async () => {
    mockAuth.mockResolvedValue(session("EDITOR", "u1") as never);
    vi.mocked(prisma.workLog.findUnique).mockResolvedValue(EXISTING as never);
    vi.mocked(prisma.workLog.update).mockRejectedValue(Object.assign(new Error("fk"), { code: "P2003" }));
    const res = await PUT(put({ assetId: "gone" }), { params: params() });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("unknownReference");
  });
  it("400 on invalid body", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    vi.mocked(prisma.workLog.findUnique).mockResolvedValue(EXISTING as never);
    expect((await PUT(put({ description: "" }), { params: params() })).status).toBe(400);
  });
  it("author updates description + date and audits changes", async () => {
    mockAuth.mockResolvedValue(session("EDITOR", "u1") as never);
    vi.mocked(prisma.workLog.findUnique).mockResolvedValue(EXISTING as never);
    vi.mocked(prisma.workLog.update).mockResolvedValue({ id: "w1", description: "new" } as never);
    const res = await PUT(put({ description: "new", performedAt: "2024-02-02", jiraIssueKey: "AVT-1" }), { params: params() });
    expect(res.status).toBe(200);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "UPDATE",
        entityType: "WorkLog",
        detail: { changes: expect.objectContaining({ Description: { from: "old", to: "new" }, "JIRA issue": { from: null, to: "AVT-1" }, "Performed at": { from: "2024-01-01", to: "2024-02-02" } }) },
      })
    );
  });
});

describe("DELETE /api/work-logs/[id]", () => {
  it("404 when missing", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    vi.mocked(prisma.workLog.findUnique).mockResolvedValue(null as never);
    expect((await DELETE(del(), { params: params() })).status).toBe(404);
  });
  it("403 when neither author nor admin", async () => {
    mockAuth.mockResolvedValue(session("EDITOR", "other") as never);
    vi.mocked(prisma.workLog.findUnique).mockResolvedValue(EXISTING as never);
    expect((await DELETE(del(), { params: params() })).status).toBe(403);
  });
  it("admin deletes and audits a snapshot (with jira)", async () => {
    mockAuth.mockResolvedValue(session("ADMIN", "admin") as never);
    vi.mocked(prisma.workLog.findUnique).mockResolvedValue({ ...EXISTING, jiraIssueKey: "AVT-9" } as never);
    vi.mocked(prisma.workLog.delete).mockResolvedValue({} as never);
    const res = await DELETE(del(), { params: params() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "DELETE", entityType: "WorkLog", detail: { snapshot: expect.objectContaining({ "JIRA issue": "AVT-9" }) } })
    );
  });
});
