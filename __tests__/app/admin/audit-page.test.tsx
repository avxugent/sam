import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { auditLog: { findMany: vi.fn() } } }));
vi.mock("@/components/admin/audit-log-client", () => ({ AuditLogClient: vi.fn(() => null) }));

import AuditLogPage from "@/app/(dashboard)/admin/audit/page";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AuditLogClient } from "@/components/admin/audit-log-client";
import { NON_ADMIN_ROLES, propsOf, renderPage, session } from "../helpers";

const mockAuth = vi.mocked(auth);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin/audit page", () => {
  it("redirects an unauthenticated visitor to / without reading the audit log", async () => {
    mockAuth.mockResolvedValue(null as never);
    await expect(AuditLogPage()).rejects.toThrow("REDIRECT:/");
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });

  it.each(NON_ADMIN_ROLES)("redirects a %s to / without reading the audit log", async (role) => {
    mockAuth.mockResolvedValue(session(role) as never);
    await expect(AuditLogPage()).rejects.toThrow("REDIRECT:/");
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });

  it("passes the latest 500 entries with ISO timestamps to the client for an admin", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([
      { id: "l1", entityType: "Asset", action: "UPDATE", timestamp: new Date("2026-01-02T03:04:05.000Z") },
    ] as never);

    await renderPage(AuditLogPage());

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({ orderBy: { timestamp: "desc" }, take: 500 });
    expect(propsOf(AuditLogClient).initialLogs).toEqual([
      { id: "l1", entityType: "Asset", action: "UPDATE", timestamp: "2026-01-02T03:04:05.000Z" },
    ]);
  });
});
