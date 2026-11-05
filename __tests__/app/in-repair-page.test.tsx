import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key
  ),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { asset: { findMany: vi.fn() } } }));
vi.mock("@/components/assets/in-repair-table", () => ({ InRepairTable: vi.fn(() => null) }));
vi.mock("@/components/layout/page-header", () => ({ PageHeader: vi.fn(() => null) }));

import InRepairPage, { generateMetadata } from "@/app/(dashboard)/in-repair/page";
import { prisma } from "@/lib/prisma";
import { InRepairTable } from "@/components/assets/in-repair-table";
import { PageHeader } from "@/components/layout/page-header";
import { propsOf, renderPage } from "./helpers";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("in-repair page", () => {
  it("titles the page", async () => {
    expect(await generateMetadata()).toEqual({ title: "title" });
  });

  it("loads only assets in repair, most recently sent first, with ISO dates", async () => {
    vi.mocked(prisma.asset.findMany).mockResolvedValue([
      { id: "a1", repairStartedAt: new Date("2026-05-01T08:00:00.000Z") },
      { id: "a2", repairStartedAt: null },
    ] as never);

    await renderPage(InRepairPage());

    const query = vi.mocked(prisma.asset.findMany).mock.calls[0][0]!;
    expect(query.where).toEqual({ status: "IN_REPAIR" });
    expect(query.orderBy).toEqual({ repairStartedAt: "desc" });
    expect(query.select).toMatchObject({ repairNote: true, location: { select: { id: true, name: true } } });
    expect(propsOf(InRepairTable).assets).toEqual([
      { id: "a1", repairStartedAt: "2026-05-01T08:00:00.000Z" },
      { id: "a2", repairStartedAt: null },
    ]);
    expect(propsOf(PageHeader).subtitle).toBe('subtitle:{"count":2}');
  });
});
