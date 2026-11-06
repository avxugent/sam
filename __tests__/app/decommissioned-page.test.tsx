import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key
  ),
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { asset: { findMany: vi.fn() } } }));
vi.mock("@/components/assets/decommissioned-table", () => ({ DecommissionedTable: vi.fn(() => null) }));
vi.mock("@/components/layout/page-header", () => ({ PageHeader: vi.fn(() => null) }));

import DecommissionedPage, { generateMetadata } from "@/app/(dashboard)/decommissioned/page";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DecommissionedTable } from "@/components/assets/decommissioned-table";
import { PageHeader } from "@/components/layout/page-header";
import { propsOf, renderPage, session } from "./helpers";

const mockAuth = vi.mocked(auth);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.asset.findMany).mockResolvedValue([] as never);
});

describe("decommissioned page", () => {
  it("titles the page", async () => {
    expect(await generateMetadata()).toEqual({ title: "title" });
  });

  it("treats a missing session as a VIEWER", async () => {
    mockAuth.mockResolvedValue(null as never);
    await renderPage(DecommissionedPage());
    expect(propsOf(DecommissionedTable).userRole).toBe("VIEWER");
  });

  it("passes the session role to the table", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    await renderPage(DecommissionedPage());
    expect(propsOf(DecommissionedTable).userRole).toBe("ADMIN");
  });

  it("loads only decommissioned assets, newest first, with ISO dates", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    vi.mocked(prisma.asset.findMany).mockResolvedValue([
      { id: "a1", decommissionedAt: new Date("2026-04-01T10:00:00.000Z") },
      { id: "a2", decommissionedAt: null },
    ] as never);

    await renderPage(DecommissionedPage());

    const query = vi.mocked(prisma.asset.findMany).mock.calls[0][0]!;
    expect(query.where).toEqual({ status: "DECOMMISSIONED" });
    expect(query.orderBy).toEqual({ decommissionedAt: "desc" });
    expect(query.select).toMatchObject({ lastLocationName: true, lastLocationFiNumber: true, decommissionNote: true });
    expect(propsOf(DecommissionedTable).assets).toEqual([
      { id: "a1", decommissionedAt: "2026-04-01T10:00:00.000Z" },
      { id: "a2", decommissionedAt: null },
    ]);
    expect(propsOf(PageHeader).subtitle).toBe('subtitle:{"count":2}');
  });
});
