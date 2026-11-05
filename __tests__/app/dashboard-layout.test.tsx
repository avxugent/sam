import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { count: vi.fn(), findUnique: vi.fn() },
    location: { findMany: vi.fn() },
    stockItem: { count: vi.fn() },
    asset: { count: vi.fn() },
    assetType: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/app-settings", () => ({ readBrandingSettings: vi.fn() }));
vi.mock("@/lib/locations/path", () => ({ getInstalledUnitTotals: vi.fn() }));
vi.mock("@/components/layout/sidebar", () => ({ Sidebar: vi.fn(() => null) }));
vi.mock("@/components/layout/header", () => ({ Header: vi.fn(() => null) }));
vi.mock("@/components/layout/mobile-bottom-nav", () => ({ MobileBottomNav: vi.fn(() => null) }));
vi.mock("@/components/layout/theme-sync", () => ({ ThemeSync: vi.fn(() => null) }));
vi.mock("@/components/layout/app-footer", () => ({ AppFooter: vi.fn(() => null) }));

import DashboardLayout from "@/app/(dashboard)/layout";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readBrandingSettings } from "@/lib/app-settings";
import { getInstalledUnitTotals } from "@/lib/locations/path";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { ThemeSync } from "@/components/layout/theme-sync";
import { AppFooter } from "@/components/layout/app-footer";
import { version } from "@/package.json";
import { propsOf, renderPage, session } from "./helpers";

const mockAuth = vi.mocked(auth);

function call() {
  return DashboardLayout({ children: <p>page body</p> });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.user.count).mockResolvedValue(1 as never);
  vi.mocked(prisma.location.findMany).mockResolvedValue([
    { id: "root", name: "Root", parentId: null },
    { id: "child", name: "Child", parentId: "root" },
  ] as never);
  vi.mocked(getInstalledUnitTotals).mockResolvedValue({ root: 4 } as never);
  vi.mocked(prisma.stockItem.count).mockResolvedValue(5 as never);
  vi.mocked(prisma.asset.count).mockImplementation((async (args: { where: { status: string } }) =>
    args.where.status === "DECOMMISSIONED" ? 2 : 3) as never);
  vi.mocked(prisma.assetType.findMany).mockResolvedValue([{ id: "t1", name: "Cable" }] as never);
  vi.mocked(readBrandingSettings).mockResolvedValue({ appTitle: "My SAM", hasLogo: true } as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ provider: "credentials", totpEnabled: true, theme: "dark" } as never);
});

describe("dashboard layout", () => {
  it("redirects an unauthenticated visitor to /login", async () => {
    mockAuth.mockResolvedValue(null as never);
    await expect(call()).rejects.toThrow("REDIRECT:/login");
    expect(prisma.location.findMany).not.toHaveBeenCalled();
  });

  it("redirects to /setup when no users exist yet", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    vi.mocked(prisma.user.count).mockResolvedValue(0 as never);
    await expect(call()).rejects.toThrow("REDIRECT:/setup");
    expect(prisma.location.findMany).not.toHaveBeenCalled();
  });

  it("feeds the sidebar the location tree, counts, stock types and branding", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);

    await renderPage(call());

    expect(screen.getByText("page body")).toBeInTheDocument();
    expect(prisma.location.findMany).toHaveBeenCalledWith({ orderBy: [{ order: "asc" }, { name: "asc" }] });
    expect(prisma.asset.count).toHaveBeenCalledWith({ where: { status: "DECOMMISSIONED" } });
    expect(prisma.asset.count).toHaveBeenCalledWith({ where: { status: "IN_REPAIR" } });
    expect(prisma.assetType.findMany).toHaveBeenCalledWith({
      where: { stockItems: { some: {} } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    const sidebar = propsOf(Sidebar);
    expect(sidebar).toMatchObject({
      userRole: "EDITOR",
      assetCountMap: { root: 4 },
      stockItemCount: 5,
      stockTypes: [{ id: "t1", name: "Cable" }],
      decommissionedCount: 2,
      inRepairCount: 3,
      appTitle: "My SAM",
      logoUrl: "/api/branding/logo",
    });
    const tree = sidebar.locationTree as { id: string; children: { id: string }[] }[];
    expect(tree.map((n) => n.id)).toEqual(["root"]);
    expect(tree[0].children.map((n) => n.id)).toEqual(["child"]);
    expect(propsOf(AppFooter).version).toBe(version);
  });

  it("builds the header user from the session and the user's DB row", async () => {
    mockAuth.mockResolvedValue(session("VIEWER", "u5") as never);

    await renderPage(call());

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "u5" },
      select: { provider: true, totpEnabled: true, theme: true },
    });
    expect(propsOf(Header)).toEqual({
      user: { name: "Test User", email: "test@example.com", role: "VIEWER", provider: "credentials", totpEnabled: true },
      appTitle: "My SAM",
      logoUrl: "/api/branding/logo",
    });
    expect(propsOf(ThemeSync).serverTheme).toBe("dark");
  });

  it("falls back to credentials, no 2FA and the light theme when the user row is missing, and omits the logo", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);
    vi.mocked(readBrandingSettings).mockResolvedValue({ appTitle: "SAM", hasLogo: false } as never);

    await renderPage(call());

    expect(propsOf(Header).user).toMatchObject({ provider: "credentials", totpEnabled: false });
    expect(propsOf(Header).logoUrl).toBeNull();
    expect(propsOf(ThemeSync).serverTheme).toBe("light");
  });

  it.each([
    ["VIEWER", false],
    ["EDITOR", false],
    ["MAINTAINER", true],
    ["ADMIN", true],
  ] as const)("shows the mobile admin tab for a %s: %s", async (role, expected) => {
    mockAuth.mockResolvedValue(session(role) as never);
    await renderPage(call());
    expect(propsOf(MobileBottomNav).showAdminTab).toBe(expected);
  });
});
