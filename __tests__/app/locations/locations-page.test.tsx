import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key
  ),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { location: { findMany: vi.fn() }, asset: { aggregate: vi.fn() } },
}));
vi.mock("@/lib/locations/path", () => ({ getRecursiveAssetCounts: vi.fn() }));
vi.mock("@/components/locations/location-browser-client", () => ({ LocationBrowserClient: vi.fn(() => null) }));
vi.mock("@/components/layout/page-header", () => ({ PageHeader: vi.fn(() => null) }));

import AllLocationsPage, { generateMetadata } from "@/app/(dashboard)/locations/page";
import { prisma } from "@/lib/prisma";
import { getRecursiveAssetCounts } from "@/lib/locations/path";
import { LocationBrowserClient } from "@/components/locations/location-browser-client";
import { PageHeader } from "@/components/layout/page-header";
import { propsOf, renderPage } from "../helpers";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getRecursiveAssetCounts).mockResolvedValue({ campus: 3, b: 3 } as never);
});

describe("locations overview page", () => {
  it("titles the page from the nav namespace", async () => {
    expect(await generateMetadata()).toEqual({ title: "locations" });
  });

  it("nests the locations into a tree and passes the recursive counts", async () => {
    vi.mocked(prisma.location.findMany).mockResolvedValue([
      { id: "campus", name: "Campus", fiNumber: null, parentId: null },
      { id: "b", name: "Building B", fiNumber: "FI-1", parentId: "campus" },
    ] as never);
    vi.mocked(prisma.asset.aggregate).mockResolvedValue({ _sum: { quantity: 7 } } as never);

    await renderPage(AllLocationsPage());

    expect(prisma.location.findMany).toHaveBeenCalledWith({
      select: { id: true, name: true, fiNumber: true, parentId: true },
      orderBy: [{ order: "asc" }, { name: "asc" }],
    });
    expect(prisma.asset.aggregate).toHaveBeenCalledWith({ where: { status: "INSTALLED" }, _sum: { quantity: true } });

    const props = propsOf(LocationBrowserClient);
    expect(props.assetCountMap).toEqual({ campus: 3, b: 3 });
    const tree = props.locationTree as { id: string; children: { id: string }[] }[];
    expect(tree.map((n) => n.id)).toEqual(["campus"]);
    expect(tree[0].children.map((n) => n.id)).toEqual(["b"]);
    expect(propsOf(PageHeader)).toMatchObject({ title: "locations", subtitle: 'assetCount:{"count":7}' });
  });

  it("counts zero installed units when there are no assets", async () => {
    vi.mocked(prisma.location.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.asset.aggregate).mockResolvedValue({ _sum: { quantity: null } } as never);

    await renderPage(AllLocationsPage());

    expect(propsOf(PageHeader).subtitle).toBe('assetCount:{"count":0}');
    expect(propsOf(LocationBrowserClient).locationTree).toEqual([]);
  });
});
