import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import { Package, Plus } from "lucide-react";
import { StockItemTable } from "@/components/stock/stock-item-table";
import { StockItemFormDialog } from "@/components/stock/stock-item-form-dialog";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("stock");
  return { title: `${t("title")} – SAM` };
}

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ typeId?: string }>;
}) {
  const { typeId } = await searchParams;

  const session = await auth();
  const userRole = session?.user?.role ?? "VIEWER";
  const canEdit = userRole === "ADMIN" || userRole === "EDITOR";

  const t = await getTranslations("stock");

  const [allItems, activeType] = await Promise.all([
    prisma.stockItem.findMany({
      where: typeId ? { typeId } : {},
      include: { type: true, manufacturer: true },
      orderBy: { createdAt: "desc" },
    }),
    typeId
      ? prisma.assetType.findUnique({ where: { id: typeId }, select: { name: true } })
      : Promise.resolve(null),
  ]);

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
        {canEdit && (
          <StockItemFormDialog mode="create">
            <Button size="sm" className="bg-[#1e64c8] hover:bg-[#1a56b0] text-white flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              {t("addItem")}
            </Button>
          </StockItemFormDialog>
        )}
      </div>

      <StockItemTable key={typeId ?? "all"} items={allItems} userRole={userRole} />
    </div>
  );
}
