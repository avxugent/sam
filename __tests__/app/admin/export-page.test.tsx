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
vi.mock("@/lib/app-settings", () => ({ readExportSettings: vi.fn() }));
vi.mock("@/components/admin/export-client", () => ({ ExportClient: vi.fn(() => null) }));

import ExportPage from "@/app/(dashboard)/admin/export/page";
import { auth } from "@/lib/auth";
import { readExportSettings } from "@/lib/app-settings";
import { ExportClient } from "@/components/admin/export-client";
import { NON_ADMIN_ROLES, propsOf, renderPage, session } from "../helpers";

const mockAuth = vi.mocked(auth);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin/export page", () => {
  it("redirects an unauthenticated visitor to / without reading settings", async () => {
    mockAuth.mockResolvedValue(null as never);
    await expect(ExportPage()).rejects.toThrow("REDIRECT:/");
    expect(readExportSettings).not.toHaveBeenCalled();
  });

  it.each(NON_ADMIN_ROLES)("redirects a %s to / without reading settings", async (role) => {
    mockAuth.mockResolvedValue(session(role) as never);
    await expect(ExportPage()).rejects.toThrow("REDIRECT:/");
    expect(readExportSettings).not.toHaveBeenCalled();
  });

  it("passes the export settings to the client for an admin", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    vi.mocked(readExportSettings).mockResolvedValue({
      cronExpression: "0 2 * * *",
      outputDir: "/exports",
      enabled: true,
    } as never);

    await renderPage(ExportPage());

    expect(propsOf(ExportClient)).toEqual({
      initialCronExpression: "0 2 * * *",
      initialOutputDir: "/exports",
      initialEnabled: true,
    });
  });
});
