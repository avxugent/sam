import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-intl/server", () => ({ getTranslations: vi.fn(async () => (key: string) => key) }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    stockItem: { findMany: vi.fn() },
    assetType: { findUnique: vi.fn() },
    location: { findMany: vi.fn() },
  },
}));
vi.mock("@/components/stock/stock-item-table", () => ({ StockItemTable: vi.fn(() => null) }));
vi.mock("@/components/stock/stock-item-form-dialog", () => ({ StockItemFormDialog: vi.fn(() => null) }));
vi.mock("@/components/stock/stock-location-filter", () => ({ StockLocationFilter: vi.fn(() => null) }));
vi.mock("@/components/layout/page-header", () => ({ PageHeader: vi.fn(() => null) }));

import StockPage from "@/app/(dashboard)/stock/page";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StockItemTable } from "@/components/stock/stock-item-table";
import { StockItemFormDialog } from "@/components/stock/stock-item-form-dialog";
import { StockLocationFilter } from "@/components/stock/stock-location-filter";
import { PageHeader } from "@/components/layout/page-header";
import { propsOf, renderPage, session } from "./helpers";

const mockAuth = vi.mocked(auth);

function call(searchParams: { typeId?: string; locationId?: string } = {}) {
  return StockPage({ searchParams: Promise.resolve(searchParams) });
}

const locations = [
  { id: "campus", name: "Campus", parentId: null },
  { id: "b", name: "Building B", parentId: "campus" },
  { id: "a", name: "Building A", parentId: "campus" },
  { id: "empty", name: "Empty", parentId: null },
];

/** First findMany call is the item list, second the distinct stock locations. */
function mockStock(items: unknown[], stockLocationIds: string[]) {
  vi.mocked(prisma.stockItem.findMany)
    .mockResolvedValueOnce(items as never)
    .mockResolvedValueOnce(stockLocationIds.map((locationId) => ({ locationId })) as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.location.findMany).mockResolvedValue(locations as never);
  vi.mocked(prisma.assetType.findUnique).mockResolvedValue(null as never);
});

describe("stock page", () => {
  it("treats a missing session as a read-only VIEWER (no create dialog)", async () => {
    mockAuth.mockResolvedValue(null as never);
    mockStock([], []);

    await renderPage(call());

    expect(StockItemFormDialog).not.toHaveBeenCalled();
    expect(propsOf(StockItemTable).userRole).toBe("VIEWER");
  });

  it("hides the create dialog for a viewer", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    mockStock([], []);

    await renderPage(call());

    expect(StockItemFormDialog).not.toHaveBeenCalled();
  });

  it.each(["EDITOR", "MAINTAINER", "ADMIN"] as const)("shows the create dialog for a %s", async (role) => {
    mockAuth.mockResolvedValue(session(role) as never);
    mockStock([], []);

    await renderPage(call());

    expect(propsOf(StockItemFormDialog).mode).toBe("create");
    expect(propsOf(StockItemTable).userRole).toBe(role);
  });

  it("passes items, breadcrumbs and totals, and lists only locations holding stock, sorted by breadcrumb", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    const items = [
      { id: "s1", quantity: 2 },
      { id: "s2", quantity: 3 },
    ];
    mockStock(items, ["b", "a"]);

    await renderPage(call());

    const table = propsOf(StockItemTable);
    expect(table.items).toBe(items);
    expect(table.locationBreadcrumbs).toEqual({
      campus: "Campus",
      b: "Campus › Building B",
      a: "Campus › Building A",
      empty: "Empty",
    });
    expect(propsOf(StockLocationFilter).locations).toEqual([
      { id: "a", breadcrumb: "Campus › Building A" },
      { id: "b", breadcrumb: "Campus › Building B" },
    ]);
    expect(propsOf(PageHeader)).toMatchObject({ title: "title", subtitle: "2 items · 5 units totalSuffix" });
    expect(prisma.assetType.findUnique).not.toHaveBeenCalled();
  });

  it("uses singular labels and omits the units suffix when there are no items", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    mockStock([{ id: "s1", quantity: 1 }], []);
    await renderPage(call());
    expect(propsOf(PageHeader).subtitle).toBe("1 item · 1 unit totalSuffix");

    vi.clearAllMocks();
    vi.mocked(prisma.location.findMany).mockResolvedValue(locations as never);
    mockStock([], []);
    await renderPage(call());
    expect(propsOf(PageHeader).subtitle).toBe("0 items");
  });

  it("filters by typeId and locationId and titles the page with the type name", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    vi.mocked(prisma.assetType.findUnique).mockResolvedValue({ name: "Laptop" } as never);
    mockStock([], []);

    await renderPage(call({ typeId: "t1", locationId: "a" }));

    expect(vi.mocked(prisma.stockItem.findMany).mock.calls[0][0]!.where).toEqual({ typeId: "t1", locationId: "a" });
    // The location dropdown source ignores the active filters.
    expect(vi.mocked(prisma.stockItem.findMany).mock.calls[1][0]!.where).toEqual({ locationId: { not: null } });
    expect(prisma.assetType.findUnique).toHaveBeenCalledWith({ where: { id: "t1" }, select: { name: true } });
    expect(propsOf(PageHeader).title).toBe("Laptop");
  });
});
