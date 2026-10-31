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
  prisma: { assetType: { findMany: vi.fn() }, manufacturer: { findMany: vi.fn() } },
}));
vi.mock("@/components/admin/asset-types-client", () => ({ AssetTypesClient: vi.fn(() => null) }));

import AssetTypesPage from "@/app/(dashboard)/admin/asset-types/page";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AssetTypesClient } from "@/components/admin/asset-types-client";
import { NON_ADMIN_ROLES, propsOf, renderPage, session } from "../helpers";

const mockAuth = vi.mocked(auth);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin/asset-types page", () => {
  it("redirects an unauthenticated visitor to / without querying", async () => {
    mockAuth.mockResolvedValue(null as never);
    await expect(AssetTypesPage()).rejects.toThrow("REDIRECT:/");
    expect(prisma.assetType.findMany).not.toHaveBeenCalled();
    expect(prisma.manufacturer.findMany).not.toHaveBeenCalled();
  });

  it.each(NON_ADMIN_ROLES)("redirects a %s to / without querying", async (role) => {
    mockAuth.mockResolvedValue(session(role) as never);
    await expect(AssetTypesPage()).rejects.toThrow("REDIRECT:/");
    expect(prisma.assetType.findMany).not.toHaveBeenCalled();
    expect(prisma.manufacturer.findMany).not.toHaveBeenCalled();
  });

  it("passes types (installed-asset counts) and manufacturers to the client for an admin", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    const types = [{ id: "t1", name: "Server", _count: { assets: 3 } }];
    const manufacturers = [{ id: "m1", name: "Dell" }];
    vi.mocked(prisma.assetType.findMany).mockResolvedValue(types as never);
    vi.mocked(prisma.manufacturer.findMany).mockResolvedValue(manufacturers as never);

    await renderPage(AssetTypesPage());

    expect(propsOf(AssetTypesClient)).toEqual({ initialTypes: types, manufacturers });
    const select = vi.mocked(prisma.assetType.findMany).mock.calls[0][0]!.select!;
    expect(select._count).toEqual({ select: { assets: { where: { status: "INSTALLED" } } } });
  });
});
