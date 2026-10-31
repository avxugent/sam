import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { asset: { findUnique: vi.fn() } } }));
vi.mock("@/lib/app-settings", () => ({ readGeneralSettings: vi.fn() }));
vi.mock("@/lib/locations/path", () => ({ locationBreadcrumbs: vi.fn() }));
vi.mock("@/lib/users/names", () => ({ userNamesById: vi.fn() }));
vi.mock("@/components/assets/asset-detail-client", () => ({ AssetDetailClient: vi.fn(() => null) }));

import AssetPage, { generateMetadata } from "@/app/(dashboard)/locations/[id]/assets/[assetId]/page";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readGeneralSettings } from "@/lib/app-settings";
import { locationBreadcrumbs } from "@/lib/locations/path";
import { userNamesById } from "@/lib/users/names";
import { AssetDetailClient } from "@/components/assets/asset-detail-client";
import { propsOf, renderPage, session } from "../../helpers";

const mockAuth = vi.mocked(auth);

function call(id = "loc-1", assetId = "asset-1") {
  return AssetPage({ params: Promise.resolve({ id, assetId }) });
}

const baseAsset = {
  id: "asset-1",
  locationId: "loc-1",
  ownerId: null,
  decommissionedById: null,
  sentForRepairById: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue(session("MAINTAINER") as never);
  vi.mocked(readGeneralSettings).mockResolvedValue({
    hostnameUrlTemplate: "",
    macAddressUrlTemplate: "https://m/{mac}",
    locationUrlTemplate: "",
  } as never);
  vi.mocked(prisma.asset.findUnique).mockResolvedValue(baseAsset as never);
  vi.mocked(locationBreadcrumbs).mockResolvedValue([{ id: "loc-1", name: "Room 1" }]);
  vi.mocked(userNamesById).mockResolvedValue(new Map());
});

describe("locations/[id]/assets/[assetId] page", () => {
  it("calls notFound for an unknown asset", async () => {
    vi.mocked(prisma.asset.findUnique).mockResolvedValue(null as never);

    await expect(call("loc-1", "missing")).rejects.toThrow("NOT_FOUND");

    expect(locationBreadcrumbs).not.toHaveBeenCalled();
    expect(userNamesById).not.toHaveBeenCalled();
    expect(AssetDetailClient).not.toHaveBeenCalled();
  });

  it("calls notFound when the asset belongs to another location than the URL", async () => {
    await expect(call("other-loc", "asset-1")).rejects.toThrow("NOT_FOUND");

    expect(locationBreadcrumbs).not.toHaveBeenCalled();
    expect(AssetDetailClient).not.toHaveBeenCalled();
  });

  it("passes the asset, breadcrumbs, role and templates (empty → null) to the client", async () => {
    await renderPage(call());

    expect(locationBreadcrumbs).toHaveBeenCalledWith("loc-1");
    expect(propsOf(AssetDetailClient)).toEqual({
      asset: baseAsset,
      breadcrumbs: [{ id: "loc-1", name: "Room 1" }],
      userRole: "MAINTAINER",
      hostnameUrlTemplate: null,
      macAddressUrlTemplate: "https://m/{mac}",
      ownerName: null,
      decommissionedByName: null,
      sentForRepairByName: null,
    });
  });

  it("defaults the role to VIEWER without a session", async () => {
    mockAuth.mockResolvedValue(null as never);
    await renderPage(call());
    expect(propsOf(AssetDetailClient).userRole).toBe("VIEWER");
  });

  it("resolves soft user references to names, null for deleted users", async () => {
    vi.mocked(prisma.asset.findUnique).mockResolvedValue({
      ...baseAsset,
      ownerId: "u1",
      decommissionedById: "u2",
      sentForRepairById: "gone",
    } as never);
    vi.mocked(userNamesById).mockResolvedValue(new Map([["u1", "Alice"], ["u2", "Bob"]]));

    await renderPage(call());

    expect(userNamesById).toHaveBeenCalledWith(["u1", "u2", "gone"]);
    expect(propsOf(AssetDetailClient)).toMatchObject({
      ownerName: "Alice",
      decommissionedByName: "Bob",
      sentForRepairByName: null,
    });
  });

  it("generateMetadata prefers model name, then serial number, then a fallback", async () => {
    const meta = (asset: unknown) => {
      vi.mocked(prisma.asset.findUnique).mockResolvedValueOnce(asset as never);
      return generateMetadata({ params: Promise.resolve({ id: "loc-1", assetId: "asset-1" }) });
    };
    await expect(meta({ model: { name: "R740" }, serialNumber: "SN1" })).resolves.toEqual({ title: "R740" });
    await expect(meta({ model: null, serialNumber: "SN1" })).resolves.toEqual({ title: "SN1" });
    await expect(meta(null)).resolves.toEqual({ title: "title" });
  });
});
