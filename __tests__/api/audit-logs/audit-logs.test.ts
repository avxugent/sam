import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  prisma: {
    auditLog: { findMany: vi.fn() },
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GET as getAuditLogs } from "@/app/api/audit-logs/route";

const mockAuth = vi.mocked(auth);
const mockAuditFind = vi.mocked(prisma.auditLog.findMany);

beforeEach(() => vi.clearAllMocks());

describe("GET /api/audit-logs", () => {
  function req(qs = "") {
    return new NextRequest(`http://localhost/api/audit-logs${qs}`);
  }
  const admin = { user: { id: "u1", role: "ADMIN", email: "a@b.com" } };

  it("401 unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await getAuditLogs(req())).status).toBe(401);
  });

  it("403 for non-admin", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u2", role: "EDITOR" } } as never);
    expect((await getAuditLogs(req())).status).toBe(403);
  });

  it("returns logs with no filters (default limit)", async () => {
    mockAuth.mockResolvedValue(admin as never);
    mockAuditFind.mockResolvedValue([{ id: "l1" }] as never);
    const res = await getAuditLogs(req());
    expect(res.status).toBe(200);
    expect(mockAuditFind).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, orderBy: { timestamp: "desc" }, take: 500 })
    );
  });

  it("applies action/entityType/userId and date-range filters", async () => {
    mockAuth.mockResolvedValue(admin as never);
    mockAuditFind.mockResolvedValue([] as never);
    await getAuditLogs(req("?action=CREATE&entityType=Asset&userId=u9&from=2024-01-01&to=2024-02-01"));
    const arg = mockAuditFind.mock.calls[0][0];
    expect(arg.where).toMatchObject({ action: "CREATE", entityType: "Asset", userId: "u9" });
    expect(arg.where.timestamp.gte).toBeInstanceOf(Date);
    expect(arg.where.timestamp.lte).toBeInstanceOf(Date);
  });

  it("caps the limit at 1000", async () => {
    mockAuth.mockResolvedValue(admin as never);
    mockAuditFind.mockResolvedValue([] as never);
    await getAuditLogs(req("?limit=99999"));
    expect(mockAuditFind).toHaveBeenCalledWith(expect.objectContaining({ take: 1000 }));
  });

  it.each(["?limit=abc", "?limit=0", "?from=not-a-date", "?to=2024-13-45"])("400 for an invalid query (%s)", async (qs) => {
    mockAuth.mockResolvedValue(admin as never);
    expect((await getAuditLogs(req(qs))).status).toBe(400);
    expect(mockAuditFind).not.toHaveBeenCalled();
  });
});
