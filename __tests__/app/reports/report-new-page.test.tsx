import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/reports/builder-options", () => ({ loadReportBuilderOptions: vi.fn() }));
vi.mock("@/components/reports/report-builder", () => ({ ReportBuilder: vi.fn(() => null) }));
vi.mock("@/components/layout/page-header", () => ({ PageHeader: vi.fn(() => null) }));

import NewReportPage, { generateMetadata } from "@/app/(dashboard)/reports/new/page";
import { auth } from "@/lib/auth";
import { loadReportBuilderOptions } from "@/lib/reports/builder-options";
import { ReportBuilder } from "@/components/reports/report-builder";
import { propsOf, renderPage, session } from "../helpers";

const mockAuth = vi.mocked(auth);
const options = { assetTypes: [], manufacturers: [{ id: "m1", name: "Dell" }] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadReportBuilderOptions).mockResolvedValue(options as never);
});

describe("new report page", () => {
  it("titles the page", async () => {
    expect(await generateMetadata()).toEqual({ title: "newReport" });
  });

  it("redirects an unauthenticated visitor to /login", async () => {
    mockAuth.mockResolvedValue(null as never);
    await expect(NewReportPage()).rejects.toThrow("REDIRECT:/login");
    expect(loadReportBuilderOptions).not.toHaveBeenCalled();
  });

  it("redirects a viewer to the report list", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    await expect(NewReportPage()).rejects.toThrow("REDIRECT:/reports");
    expect(loadReportBuilderOptions).not.toHaveBeenCalled();
  });

  it.each(["EDITOR", "MAINTAINER", "ADMIN"] as const)("gives a %s an empty builder with the options", async (role) => {
    mockAuth.mockResolvedValue(session(role) as never);
    await renderPage(NewReportPage());
    expect(propsOf(ReportBuilder)).toEqual(options);
  });
});
