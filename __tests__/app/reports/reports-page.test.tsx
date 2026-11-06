import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key
  ),
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { report: { findMany: vi.fn() } } }));
vi.mock("@/components/reports/reports-list-client", () => ({ ReportsListClient: vi.fn(() => null) }));
vi.mock("@/components/layout/page-header", () => ({ PageHeader: vi.fn(() => null) }));

import ReportsPage, { generateMetadata } from "@/app/(dashboard)/reports/page";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ReportsListClient } from "@/components/reports/reports-list-client";
import { PageHeader } from "@/components/layout/page-header";
import { propsOf, renderPage, session } from "../helpers";

const mockAuth = vi.mocked(auth);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.report.findMany).mockResolvedValue([] as never);
});

describe("reports list page", () => {
  it("titles the page from the report namespace", async () => {
    expect(await generateMetadata()).toEqual({ title: "title" });
  });

  it("treats a missing session as a VIEWER", async () => {
    mockAuth.mockResolvedValue(null as never);
    await renderPage(ReportsPage());
    expect(propsOf(ReportsListClient).userRole).toBe("VIEWER");
  });

  it.each(["VIEWER", "EDITOR", "ADMIN"] as const)("passes the %s role to the list", async (role) => {
    mockAuth.mockResolvedValue(session(role) as never);
    await renderPage(ReportsPage());
    expect(propsOf(ReportsListClient).userRole).toBe(role);
  });

  it("loads reports newest-updated first and hands dates over as ISO strings", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.report.findMany).mockResolvedValue([
      {
        id: "r1",
        name: "Laptops",
        description: null,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-02-01T00:00:00.000Z"),
      },
    ] as never);

    await renderPage(ReportsPage());

    expect(prisma.report.findMany).toHaveBeenCalledWith({
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, description: true, createdAt: true, updatedAt: true },
    });
    expect(propsOf(ReportsListClient).reports).toEqual([
      {
        id: "r1",
        name: "Laptops",
        description: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-02-01T00:00:00.000Z",
      },
    ]);
    expect(propsOf(PageHeader).subtitle).toBe('savedCount:{"count":1}');
  });
});
