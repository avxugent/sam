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
vi.mock("@/lib/prisma", () => ({ prisma: { report: { findUnique: vi.fn() } } }));
vi.mock("@/lib/reports/builder-options", () => ({ loadReportBuilderOptions: vi.fn() }));
vi.mock("@/components/reports/report-builder", () => ({ ReportBuilder: vi.fn(() => null) }));
vi.mock("@/components/layout/page-header", () => ({ PageHeader: vi.fn(() => null) }));

import EditReportPage from "@/app/(dashboard)/reports/[id]/edit/page";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadReportBuilderOptions } from "@/lib/reports/builder-options";
import { ReportBuilder } from "@/components/reports/report-builder";
import { PageHeader } from "@/components/layout/page-header";
import { propsOf, renderPage, session } from "../helpers";

const mockAuth = vi.mocked(auth);
const options = { assetTypes: [{ id: "t1", name: "Laptop" }], manufacturers: [] };

function call(id = "r1") {
  return EditReportPage({ params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadReportBuilderOptions).mockResolvedValue(options as never);
  vi.mocked(prisma.report.findUnique).mockResolvedValue({
    id: "r1",
    name: "Laptops",
    description: null,
    definition: "{}",
  } as never);
});

describe("edit report page", () => {
  it("redirects an unauthenticated visitor to /login", async () => {
    mockAuth.mockResolvedValue(null as never);
    await expect(call()).rejects.toThrow("REDIRECT:/login");
    expect(prisma.report.findUnique).not.toHaveBeenCalled();
  });

  it("sends a viewer back to the read-only report", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    await expect(call("r9")).rejects.toThrow("REDIRECT:/reports/r9");
    expect(prisma.report.findUnique).not.toHaveBeenCalled();
  });

  it("404s for an unknown report", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    vi.mocked(prisma.report.findUnique).mockResolvedValue(null as never);
    await expect(call("missing")).rejects.toThrow("NOT_FOUND");
    expect(prisma.report.findUnique).toHaveBeenCalledWith({ where: { id: "missing" } });
    expect(loadReportBuilderOptions).not.toHaveBeenCalled();
  });

  it.each(["EDITOR", "MAINTAINER", "ADMIN"] as const)("prefills the builder for a %s", async (role) => {
    mockAuth.mockResolvedValue(session(role) as never);
    const definition = { source: "asset", columns: ["serialNumber"], filters: [], groupBy: "none" };
    vi.mocked(prisma.report.findUnique).mockResolvedValue({ id: "r1", name: "Laptops", description: null, definition: JSON.stringify(definition) } as never);

    await renderPage(call());

    expect(propsOf(ReportBuilder)).toEqual({
      reportId: "r1",
      initialName: "Laptops",
      initialDescription: "",
      initialDefinition: definition,
      ...options,
    });
    expect(propsOf(PageHeader)).toMatchObject({ title: "editReport", back: { href: "/reports/r1", label: "Laptops" } });
  });

  it("opens the builder without a definition when the stored one is invalid", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);

    await renderPage(call());

    expect(propsOf(ReportBuilder).initialDefinition).toBeUndefined();
  });
});
