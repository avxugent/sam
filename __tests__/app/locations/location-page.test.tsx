import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    location: { findUnique: vi.fn() },
    asset: { findMany: vi.fn() },
    workLog: { findMany: vi.fn() },
    workLogItem: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/app-settings", () => ({ readGeneralSettings: vi.fn() }));
vi.mock("@/lib/locations/path", () => ({
  locationBreadcrumbs: vi.fn(),
  getAllDescendantLocationIds: vi.fn(),
}));
vi.mock("@/lib/locations/asset-quantities", () => ({ withInstalledQuantities: vi.fn() }));
vi.mock("@/lib/integrations/jira", () => ({ jiraBaseUrl: vi.fn() }));
vi.mock("@/components/locations/location-detail-client", () => ({ LocationDetailClient: vi.fn(() => null) }));

import LocationPage, { generateMetadata } from "@/app/(dashboard)/locations/[id]/page";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readGeneralSettings } from "@/lib/app-settings";
import { getAllDescendantLocationIds, locationBreadcrumbs } from "@/lib/locations/path";
import { withInstalledQuantities } from "@/lib/locations/asset-quantities";
import { jiraBaseUrl } from "@/lib/integrations/jira";
import { LocationDetailClient } from "@/components/locations/location-detail-client";
import { propsOf, renderPage, session } from "../helpers";

const mockAuth = vi.mocked(auth);

function call(id = "loc-1") {
  return LocationPage({ params: Promise.resolve({ id }) });
}

function location(children: number) {
  return { id: "loc-1", name: "Room 1", children: [], _count: { assets: 1, children, attachments: 0 } };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(session("EDITOR", "user-1") as never);
  vi.mocked(readGeneralSettings).mockResolvedValue({
    hostnameUrlTemplate: "https://h/{hostname}",
    locationUrlTemplate: "",
    macAddressUrlTemplate: "",
  } as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ locationDefaultTab: "sublocations" } as never);
  vi.mocked(prisma.location.findUnique).mockResolvedValue(location(0) as never);
  vi.mocked(locationBreadcrumbs).mockResolvedValue([{ id: "loc-1", name: "Room 1" }]);
  vi.mocked(getAllDescendantLocationIds).mockResolvedValue(["child-1", "child-2"]);
  vi.mocked(withInstalledQuantities).mockImplementation(async (loc) => ({ location: loc, subtreeAssetCount: 7 }));
  vi.mocked(prisma.asset.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.workLog.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.user.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.workLogItem.findMany).mockResolvedValue([] as never);
  vi.mocked(jiraBaseUrl).mockReturnValue(null);
});

describe("locations/[id] page", () => {
  it("calls notFound for an unknown location before loading assets or work logs", async () => {
    vi.mocked(prisma.location.findUnique).mockResolvedValue(null as never);

    await expect(call("missing")).rejects.toThrow("NOT_FOUND");

    expect(prisma.location.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "missing" } }));
    expect(prisma.asset.findMany).not.toHaveBeenCalled();
    expect(prisma.workLog.findMany).not.toHaveBeenCalled();
    expect(LocationDetailClient).not.toHaveBeenCalled();
  });

  it("for a leaf location: assets of that location only, assets tab, no location column", async () => {
    await renderPage(call());

    expect(getAllDescendantLocationIds).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.asset.findMany).mock.calls[0][0]!.where).toEqual({
      locationId: { in: ["loc-1"] },
      status: "INSTALLED",
    });
    const props = propsOf(LocationDetailClient);
    expect(props).toMatchObject({
      showLocation: false,
      // A leaf ignores the user's preferred tab.
      defaultTab: "assets",
      subtreeAssetCount: 7,
      breadcrumbs: [{ id: "loc-1", name: "Room 1" }],
      userRole: "EDITOR",
      currentUserId: "user-1",
      hostnameUrlTemplate: "https://h/{hostname}",
      // Empty templates become null.
      locationUrlTemplate: null,
      jiraBaseUrl: null,
    });
  });

  it("for a location with children: includes descendants and honours the preferred tab", async () => {
    vi.mocked(prisma.location.findUnique).mockResolvedValue(location(2) as never);
    vi.mocked(jiraBaseUrl).mockReturnValue("https://jira.example.com");

    await renderPage(call());

    expect(withInstalledQuantities).toHaveBeenCalledWith(expect.objectContaining({ id: "loc-1" }), [
      "loc-1",
      "child-1",
      "child-2",
    ]);
    expect(vi.mocked(prisma.asset.findMany).mock.calls[0][0]!.where).toEqual({
      locationId: { in: ["loc-1", "child-1", "child-2"] },
      status: "INSTALLED",
    });
    expect(propsOf(LocationDetailClient)).toMatchObject({
      showLocation: true,
      defaultTab: "sublocations",
      jiraBaseUrl: "https://jira.example.com",
    });
  });

  it("falls back to the assets tab for an unknown stored preference", async () => {
    vi.mocked(prisma.location.findUnique).mockResolvedValue(location(1) as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ locationDefaultTab: "bogus" } as never);

    await renderPage(call());

    expect(propsOf(LocationDetailClient).defaultTab).toBe("assets");
  });

  it("without a session: VIEWER role, empty user id, no preference lookup", async () => {
    mockAuth.mockResolvedValue(null as never);

    await renderPage(call());

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(propsOf(LocationDetailClient)).toMatchObject({ userRole: "VIEWER", currentUserId: "" });
  });

  it("shapes work logs (YYYY-MM-DD day, selected fields) and user labels", async () => {
    vi.mocked(prisma.workLog.findMany).mockResolvedValue([
      {
        id: "wl1",
        performedAt: new Date("2026-05-01T08:00:00.000Z"),
        description: "Replaced disk",
        jiraIssueKey: "OPS-1",
        performedBy: { id: "u1", name: "Alice", email: "a@example.com" },
        item: { id: "i1", name: "Repair" },
        asset: null,
        locationId: "loc-1",
        createdAt: new Date(),
      },
    ] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: "u1", name: "Alice", email: "a@example.com" },
      { id: "u2", name: "Bob", email: null },
    ] as never);
    const items = [{ id: "i1", name: "Repair", description: null }];
    vi.mocked(prisma.workLogItem.findMany).mockResolvedValue(items as never);

    await renderPage(call());

    const props = propsOf(LocationDetailClient);
    expect(props.workLogs).toEqual([
      {
        id: "wl1",
        performedAt: "2026-05-01",
        description: "Replaced disk",
        jiraIssueKey: "OPS-1",
        performedBy: { id: "u1", name: "Alice", email: "a@example.com" },
        item: { id: "i1", name: "Repair" },
        asset: null,
      },
    ]);
    expect(props.users).toEqual([
      { id: "u1", label: "Alice (a@example.com)" },
      { id: "u2", label: "Bob" },
    ]);
    expect(props.workLogItems).toBe(items);
    expect(vi.mocked(prisma.workLog.findMany).mock.calls[0][0]!.where).toEqual({ locationId: "loc-1" });
  });

  it("generateMetadata titles the page with the location name, or a fallback", async () => {
    vi.mocked(prisma.location.findUnique).mockResolvedValueOnce({ name: "Room 1" } as never);
    await expect(generateMetadata({ params: Promise.resolve({ id: "loc-1" }) })).resolves.toEqual({ title: "Room 1" });

    vi.mocked(prisma.location.findUnique).mockResolvedValueOnce(null as never);
    await expect(generateMetadata({ params: Promise.resolve({ id: "x" }) })).resolves.toEqual({ title: "title" });
  });
});
