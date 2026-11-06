import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";

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
vi.mock("@/lib/reports/engine", () => ({ runReport: vi.fn() }));
vi.mock("@/components/reports/report-viewer", () => ({ ReportViewer: vi.fn(() => null) }));
vi.mock("@/components/reports/location-report-viewer", () => ({ LocationReportViewer: vi.fn(() => null) }));
vi.mock("@/components/layout/page-header", () => ({ PageHeader: vi.fn(() => null) }));

import ReportPage from "@/app/(dashboard)/reports/[id]/page";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runReport } from "@/lib/reports/engine";
import { ReportViewer } from "@/components/reports/report-viewer";
import { LocationReportViewer } from "@/components/reports/location-report-viewer";
import { PageHeader } from "@/components/layout/page-header";
import { propsOf, renderPage, session } from "../helpers";

const mockAuth = vi.mocked(auth);
const assetDefinition = { source: "asset", columns: ["serialNumber"], filters: [], groupBy: "none" };
const report = { id: "r1", name: "Laptops", description: "All laptops", definition: JSON.stringify(assetDefinition) };
const assetResult = { source: "asset", rows: [], total: 0 };

function call(id = "r1") {
  return ReportPage({ params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(session("VIEWER") as never);
  vi.mocked(prisma.report.findUnique).mockResolvedValue(report as never);
  vi.mocked(runReport).mockResolvedValue(assetResult as never);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("report viewer page", () => {
  it("404s for an unknown report without running anything", async () => {
    vi.mocked(prisma.report.findUnique).mockResolvedValue(null as never);
    await expect(call("missing")).rejects.toThrow("NOT_FOUND");
    expect(prisma.report.findUnique).toHaveBeenCalledWith({ where: { id: "missing" } });
    expect(runReport).not.toHaveBeenCalled();
  });

  it("shows an error instead of running a report whose stored definition is invalid", async () => {
    vi.mocked(prisma.report.findUnique).mockResolvedValue({ ...report, definition: '{"source":"asset"}' } as never);
    await renderPage(call());
    expect(screen.getByText("invalidDefinition")).toBeInTheDocument();
    expect(runReport).not.toHaveBeenCalled();
    expect(ReportViewer).not.toHaveBeenCalled();
  });

  it("runs an asset report and passes its columns, result and the Grafana link", async () => {
    vi.stubEnv("GRAFANA_URL", "https://grafana.example/");
    await renderPage(call());

    expect(runReport).toHaveBeenCalledWith(assetDefinition);
    expect(propsOf(ReportViewer)).toMatchObject({
      reportId: "r1",
      reportName: "Laptops",
      columns: ["serialNumber"],
      result: assetResult,
      canEdit: false,
      grafanaUrl: "https://grafana.example/explore",
    });
    expect(propsOf(PageHeader)).toMatchObject({ title: "Laptops", subtitle: "All laptops", back: { href: "/reports", label: "title" } });
    expect(LocationReportViewer).not.toHaveBeenCalled();
  });

  it("passes a null Grafana link when GRAFANA_URL is unset", async () => {
    vi.stubEnv("GRAFANA_URL", "");
    await renderPage(call());
    expect(propsOf(ReportViewer).grafanaUrl).toBeNull();
  });

  it.each([
    [null, false],
    ["VIEWER", false],
    ["EDITOR", true],
    ["MAINTAINER", true],
    ["ADMIN", true],
  ] as const)("sets canEdit for role %s to %s", async (role, expected) => {
    mockAuth.mockResolvedValue((role ? session(role) : null) as never);
    await renderPage(call());
    expect(propsOf(ReportViewer).canEdit).toBe(expected);
  });

  it("renders a location report with the location viewer", async () => {
    const result = { source: "location", rows: [] };
    const definition = { source: "location", itemIds: ["i1"], status: "all" };
    vi.mocked(prisma.report.findUnique).mockResolvedValue({ ...report, definition: JSON.stringify(definition) } as never);
    vi.mocked(runReport).mockResolvedValue(result as never);
    mockAuth.mockResolvedValue(session("EDITOR") as never);

    await renderPage(call());

    expect(propsOf(LocationReportViewer)).toEqual({ reportId: "r1", reportName: "Laptops", result, canEdit: true });
    expect(ReportViewer).not.toHaveBeenCalled();
  });

  it("renders no viewer when the result source does not match the definition", async () => {
    vi.mocked(runReport).mockResolvedValue({ source: "location", rows: [] } as never);
    await renderPage(call());
    expect(ReportViewer).not.toHaveBeenCalled();
    expect(LocationReportViewer).not.toHaveBeenCalled();
  });
});
