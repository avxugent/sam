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
vi.mock("@/lib/prisma", () => ({
  prisma: { workLogItem: { findMany: vi.fn() }, user: { findMany: vi.fn() } },
}));
vi.mock("@/lib/app-settings", () => ({
  readGeneralSettings: vi.fn(),
  readBrandingSettings: vi.fn(),
  readComplianceSettings: vi.fn(),
}));
vi.mock("@/components/admin/general-settings-client", () => ({ GeneralSettingsClient: vi.fn(() => null) }));
vi.mock("@/components/admin/branding-settings-client", () => ({ BrandingSettingsClient: vi.fn(() => null) }));
vi.mock("@/components/admin/compliance-settings-client", () => ({ ComplianceSettingsClient: vi.fn(() => null) }));
vi.mock("@/components/admin/work-log-items-manager", () => ({ WorkLogItemsManager: vi.fn(() => null) }));

import SettingsPage from "@/app/(dashboard)/admin/settings/page";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readBrandingSettings, readComplianceSettings, readGeneralSettings } from "@/lib/app-settings";
import { GeneralSettingsClient } from "@/components/admin/general-settings-client";
import { BrandingSettingsClient } from "@/components/admin/branding-settings-client";
import { ComplianceSettingsClient } from "@/components/admin/compliance-settings-client";
import { WorkLogItemsManager } from "@/components/admin/work-log-items-manager";
import { NON_ADMIN_ROLES, propsOf, renderPage, session } from "../helpers";

const mockAuth = vi.mocked(auth);

beforeEach(() => {
  vi.clearAllMocks();
});

function expectNoReads() {
  expect(readGeneralSettings).not.toHaveBeenCalled();
  expect(readBrandingSettings).not.toHaveBeenCalled();
  expect(readComplianceSettings).not.toHaveBeenCalled();
  expect(prisma.workLogItem.findMany).not.toHaveBeenCalled();
  expect(prisma.user.findMany).not.toHaveBeenCalled();
}

describe("admin/settings page", () => {
  it("redirects an unauthenticated visitor to / without reading settings", async () => {
    mockAuth.mockResolvedValue(null as never);
    await expect(SettingsPage()).rejects.toThrow("REDIRECT:/");
    expectNoReads();
  });

  it.each(NON_ADMIN_ROLES)("redirects a %s to / without reading settings", async (role) => {
    mockAuth.mockResolvedValue(session(role) as never);
    await expect(SettingsPage()).rejects.toThrow("REDIRECT:/");
    expectNoReads();
  });

  describe("for an admin", () => {
    const workLogItems = [
      { id: "w1", name: "Review", order: 0, description: "x", _count: { workLogs: 4 } },
    ];
    const users = [{ id: "u1", name: "Alice" }];

    beforeEach(() => {
      mockAuth.mockResolvedValue(session("ADMIN") as never);
      vi.mocked(readGeneralSettings).mockResolvedValue({
        hostnameUrlTemplate: "https://h/{hostname}",
        macAddressUrlTemplate: "https://m/{mac}",
        locationUrlTemplate: "",
      } as never);
      vi.mocked(readBrandingSettings).mockResolvedValue({
        appTitle: "SAM",
        hasLogo: true,
        hasFavicon: false,
        backgroundMode: "custom",
        hasCustomBackground: true,
      } as never);
      vi.mocked(readComplianceSettings).mockResolvedValue({
        requireTwoFactor: true,
        auditRetentionDays: 365,
        defaultOwnerId: "u1",
        reviewWorkLogItemId: "w1",
        reviewPeriodMonths: 12,
      } as never);
      vi.mocked(prisma.workLogItem.findMany).mockResolvedValue(workLogItems as never);
      vi.mocked(prisma.user.findMany).mockResolvedValue(users as never);
    });

    it("passes the general and branding settings to their clients", async () => {
      await renderPage(SettingsPage());

      expect(propsOf(GeneralSettingsClient)).toEqual({
        initialHostnameUrlTemplate: "https://h/{hostname}",
        initialMacAddressUrlTemplate: "https://m/{mac}",
        initialLocationUrlTemplate: "",
      });
      expect(propsOf(BrandingSettingsClient)).toEqual({
        initialAppTitle: "SAM",
        initialHasLogo: true,
        initialHasFavicon: false,
        initialBackgroundMode: "custom",
        initialHasCustomBackground: true,
      });
    });

    it("falls back to no background for an unknown stored background mode", async () => {
      vi.mocked(readBrandingSettings).mockResolvedValue({
        appTitle: "SAM",
        hasLogo: false,
        hasFavicon: false,
        backgroundMode: "bogus",
        hasCustomBackground: false,
      } as never);

      await renderPage(SettingsPage());

      expect(propsOf(BrandingSettingsClient).initialBackgroundMode).toBe("");
    });

    it("passes compliance settings with user names and work-log item id/name pairs", async () => {
      await renderPage(SettingsPage());

      expect(propsOf(ComplianceSettingsClient)).toEqual({
        initialRequireTwoFactor: true,
        initialAuditRetentionDays: 365,
        initialDefaultOwnerId: "u1",
        initialReviewWorkLogItemId: "w1",
        initialReviewPeriodMonths: 12,
        users,
        workLogItems: [{ id: "w1", name: "Review" }],
      });
      // Only id + name of users reach the client.
      expect(vi.mocked(prisma.user.findMany).mock.calls[0][0]!.select).toEqual({ id: true, name: true });
    });

    it("passes the full work-log items (with usage counts) to the manager", async () => {
      await renderPage(SettingsPage());
      expect(propsOf(WorkLogItemsManager)).toEqual({ initialItems: workLogItems });
    });
  });
});
