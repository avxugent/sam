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
vi.mock("@/lib/prisma", () => ({ prisma: { manufacturer: { findMany: vi.fn() } } }));
vi.mock("@/components/admin/manufacturers-client", () => ({ ManufacturersClient: vi.fn(() => null) }));

import ManufacturersPage from "@/app/(dashboard)/admin/manufacturers/page";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ManufacturersClient } from "@/components/admin/manufacturers-client";
import { NON_CATALOG_ROLES, propsOf, renderPage, session } from "../helpers";

const mockAuth = vi.mocked(auth);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin/manufacturers page", () => {
  it("redirects an unauthenticated visitor to / without querying", async () => {
    mockAuth.mockResolvedValue(null as never);
    await expect(ManufacturersPage()).rejects.toThrow("REDIRECT:/");
    expect(prisma.manufacturer.findMany).not.toHaveBeenCalled();
  });

  it.each(NON_CATALOG_ROLES)("redirects a %s to / without querying", async (role) => {
    mockAuth.mockResolvedValue(session(role) as never);
    await expect(ManufacturersPage()).rejects.toThrow("REDIRECT:/");
    expect(prisma.manufacturer.findMany).not.toHaveBeenCalled();
  });

  it.each(["MAINTAINER", "ADMIN"] as const)("passes the rows with installed-asset counts to the client for a %s", async (role) => {
    mockAuth.mockResolvedValue(session(role) as never);
    const rows = [{ id: "r1", name: "Acme", _count: { assets: 2 } }];
    vi.mocked(prisma.manufacturer.findMany).mockResolvedValue(rows as never);

    await renderPage(ManufacturersPage());

    expect(propsOf(ManufacturersClient)).toEqual({ initialManufacturers: rows });
    expect(prisma.manufacturer.findMany).toHaveBeenCalledWith({
      orderBy: { name: "asc" },
      include: { _count: { select: { assets: { where: { status: "INSTALLED" } } } } },
    });
  });
});
