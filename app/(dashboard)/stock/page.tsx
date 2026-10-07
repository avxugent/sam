import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import { Package, Plus } from "lucide-react";
import { StockItemTable } from "@/components/stock/stock-item-table";
import { StockItemFormDialog } from "@/components/stock/stock-item-form-dialog";
import { StockLocationFilter } from "@/components/stock/stock-location-filter";
import { Button } from "@/components/ui/button";
import { buildLocationPathsFromRows } from "@/lib/location-path";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("stock");
  return { title: `${t("title")} – SAM` };
}

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ typeId?: string; locationId?: string }>;
}) {
  const { typeId, locationId } = await searchParams;

  const session = await auth();
  const userRole = session?.user?.role ?? "VIEWER";
  const canEdit = userRole === "ADMIN" || userRole === "EDITOR";

  const t = await getTranslations("stock");

  const [allItems, activeType, allLocations, stockLocationRows] = await Promise.all([
    prisma.stockItem.findMany({
      where: {
        ...(typeId ? { typeId } : {}),
        ...(locationId ? { locationId } : {}),
      },
      include: { type: true, manufacturer: true, model: true, location: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    typeId
      ? prisma.assetType.findUnique({ where: { id: typeId }, select: { name: true } })
      : Promise.resolve(null),
    prisma.location.findMany({ select: { id: true, name: true, parentId: true } }),
    // Independent of the typeId/locationId filters above, so the dropdown
    // doesn't shrink or reorder just because another filter is applied.
    prisma.stockItem.findMany({
      where: { locationId: { not: null } },
      select: { locationId: true },
      distinct: ["locationId"],
    }),
  ]);

  const stockLocationIds = new Set(stockLocationRows.map((r) => r.locationId!));
  const locationBreadcrumbMap = buildLocationPathsFromRows(allLocations, " › ");
  const locationBreadcrumbs = Object.fromEntries(locationBreadcrumbMap);
  const locationOptions = allLocations
    .filter((l) => stockLocationIds.has(l.id))
    .map((l) => ({ id: l.id, breadcrumb: locationBreadcrumbMap.get(l.id) ?? l.name }))
    .sort((a, b) => a.breadcrumb.localeCompare(b.breadcrumb));

  const totalUnits = allItems.reduce((sum, i) => sum + i.quantity, 0);
  const title = activeType ? activeType.name : t("title");
  const itemsLabel = allItems.length === 1 ? t("item") : t("items");
  const unitsLabel = totalUnits === 1 ? t("unit") : t("units");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-[9px] bg-[#e8f0fc] flex items-center justify-center flex-shrink-0">
            <Package className="h-4 w-4 text-[#1e64c8]" />
          </div>
          <div>
            <h1 className="text-[22px] font-bold text-[#0f172a] tracking-[-0.01em]">{title}</h1>
            <p className="text-[13px] text-[#64748b] mt-0.5">
              {allItems.length} {itemsLabel}
              {allItems.length > 0 && ` · ${totalUnits} ${unitsLabel} ${t("totalSuffix")}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StockLocationFilter locations={locationOptions} />
          {canEdit && (
            <StockItemFormDialog mode="create">
              <Button size="sm" className="bg-[#1e64c8] hover:bg-[#1a56b0] text-white flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                {t("addItem")}
              </Button>
            </StockItemFormDialog>
          )}
        </div>
      </div>

      <StockItemTable
        key={`${typeId ?? "all"}-${locationId ?? "all"}`}
        items={allItems}
        userRole={userRole}
        locationBreadcrumbs={locationBreadcrumbs}
      />
    </div>
  );
}
