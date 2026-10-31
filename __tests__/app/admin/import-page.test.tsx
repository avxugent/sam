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
vi.mock("@/components/admin/csv-import-client", () => ({ CsvImportClient: vi.fn(() => null) }));

import ImportPage from "@/app/(dashboard)/admin/import/page";
import { auth } from "@/lib/auth";
import { CsvImportClient } from "@/components/admin/csv-import-client";
import { NON_ADMIN_ROLES, renderPage, session } from "../helpers";

const mockAuth = vi.mocked(auth);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin/import page", () => {
  it("redirects an unauthenticated visitor to /login", async () => {
    mockAuth.mockResolvedValue(null as never);
    await expect(ImportPage()).rejects.toThrow("REDIRECT:/login");
  });

  it.each(NON_ADMIN_ROLES)("redirects a %s to /", async (role) => {
    mockAuth.mockResolvedValue(session(role) as never);
    await expect(ImportPage()).rejects.toThrow("REDIRECT:/");
    expect(CsvImportClient).not.toHaveBeenCalled();
  });

  it("renders the import client for an admin", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    await renderPage(ImportPage());
    expect(CsvImportClient).toHaveBeenCalledTimes(1);
  });
});
