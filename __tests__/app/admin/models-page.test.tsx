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
  prisma: {
    model: { findMany: vi.fn() },
    assetType: { findMany: vi.fn() },
    manufacturer: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/models/clusters", () => ({ getModelClusters: vi.fn() }));
vi.mock("@/components/admin/catalog/models-client", () => ({ ModelsClient: vi.fn(() => null) }));

import ModelsPage from "@/app/(dashboard)/admin/models/page";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getModelClusters } from "@/lib/models/clusters";
import { ModelsClient } from "@/components/admin/catalog/models-client";
import { NON_CATALOG_ROLES, propsOf, renderPage, session } from "../helpers";

const mockAuth = vi.mocked(auth);

function call(searchParams: { typeId?: string; manufacturerId?: string } = {}) {
  return ModelsPage({ searchParams: Promise.resolve(searchParams) });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.model.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.assetType.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.manufacturer.findMany).mockResolvedValue([] as never);
  vi.mocked(getModelClusters).mockResolvedValue([] as never);
});

function expectNoQueries() {
  expect(prisma.model.findMany).not.toHaveBeenCalled();
  expect(prisma.assetType.findMany).not.toHaveBeenCalled();
  expect(prisma.manufacturer.findMany).not.toHaveBeenCalled();
  expect(getModelClusters).not.toHaveBeenCalled();
}

describe("admin/models page", () => {
  it("redirects an unauthenticated visitor to / without querying", async () => {
    mockAuth.mockResolvedValue(null as never);
    await expect(call()).rejects.toThrow("REDIRECT:/");
    expectNoQueries();
  });

  it.each(NON_CATALOG_ROLES)("redirects a %s to / without querying", async (role) => {
    mockAuth.mockResolvedValue(session(role) as never);
    await expect(call()).rejects.toThrow("REDIRECT:/");
    expectNoQueries();
  });

  it("passes models, filter options and clusters to the client for a maintainer", async () => {
    mockAuth.mockResolvedValue(session("MAINTAINER") as never);
    const models = [{ id: "mo1", name: "R740" }];
    const assetTypes = [{ id: "t1", name: "Server" }];
    const manufacturers = [{ id: "m1", name: "Dell" }];
    const clusters = [{ ids: ["mo1", "mo2"] }];
    vi.mocked(prisma.model.findMany).mockResolvedValue(models as never);
    vi.mocked(prisma.assetType.findMany).mockResolvedValue(assetTypes as never);
    vi.mocked(prisma.manufacturer.findMany).mockResolvedValue(manufacturers as never);
    vi.mocked(getModelClusters).mockResolvedValue(clusters as never);

    await renderPage(call());

    expect(propsOf(ModelsClient)).toEqual({
      initialModels: models,
      assetTypes,
      manufacturers,
      initialClusters: clusters,
    });
    expect(vi.mocked(prisma.model.findMany).mock.calls[0][0]!.where).toEqual({});
  });

  it("filters models by typeId and manufacturerId from the search params", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);

    await renderPage(call({ typeId: "t1", manufacturerId: "m1" }));

    expect(vi.mocked(prisma.model.findMany).mock.calls[0][0]!.where).toEqual({ typeId: "t1", manufacturerId: "m1" });
    // The filter dropdown options stay unfiltered.
    expect(vi.mocked(prisma.assetType.findMany).mock.calls[0][0]).not.toHaveProperty("where");
    expect(vi.mocked(prisma.manufacturer.findMany).mock.calls[0][0]).not.toHaveProperty("where");
  });
});
