import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    report: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/schemas/report", () => ({
  createReportSchema: { safeParse: (b: unknown) => ({ success: true, data: b }) },
  updateReportSchema: { safeParse: (b: unknown) => ({ success: true, data: b }) },
}));

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { POST as createReport } from "@/app/api/reports/route";
import { PUT as updateReport, DELETE as deleteReport } from "@/app/api/reports/[id]/route";

const mockAuth = vi.mocked(auth);
const mockLogAudit = vi.mocked(logAudit);

function session(role: "ADMIN" | "EDITOR" | "VIEWER" = "ADMIN") {
  return { user: { id: "u1", role, name: "T", email: "t@test.com" } };
}

function req(url: string, body?: object, method = "POST") {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : "{}",
  });
}

beforeEach(() => vi.clearAllMocks());

describe("audit — report CRUD", () => {
  it("logs CREATE on Report", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.report.create).mockResolvedValue({ id: "r1", name: "Q1" } as never);

    const res = await createReport(
      req("http://localhost/api/reports", { name: "Q1", description: "", definition: {} })
    );
    expect(res.status).toBe(201);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CREATE", entityType: "Report", entityId: "r1", entityName: "Q1" })
    );
  });

  it("logs UPDATE on Report with name-change detail", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.report.findUnique).mockResolvedValue({ id: "r1", name: "Old" } as never);
    vi.mocked(prisma.report.update).mockResolvedValue({ id: "r1", name: "New" } as never);

    const res = await updateReport(
      req("http://localhost/api/reports/r1", { name: "New" }, "PUT"),
      { params: Promise.resolve({ id: "r1" }) }
    );
    expect(res.status).toBe(200);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "UPDATE",
        entityType: "Report",
        entityId: "r1",
        detail: { changes: { Name: { from: "Old", to: "New" } } },
      })
    );
  });

  it("logs DELETE on Report", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    vi.mocked(prisma.report.findUnique).mockResolvedValue({ id: "r1", name: "Q1" } as never);
    vi.mocked(prisma.report.delete).mockResolvedValue({ id: "r1" } as never);

    const res = await deleteReport(
      req("http://localhost/api/reports/r1", undefined, "DELETE"),
      { params: Promise.resolve({ id: "r1" }) }
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "DELETE", entityType: "Report", entityId: "r1", entityName: "Q1" })
    );
  });
});
