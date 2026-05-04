import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Package, Plus } from "lucide-react";
import { StockItemTable } from "@/components/stock/stock-item-table";
import { StockItemFormDialog } from "@/components/stock/stock-item-form-dialog";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Stock – SAM" };

export default async function StockPage() {
  const session = await auth();
  const userRole = session?.user?.role ?? "VIEWER";
  const canEdit = userRole === "ADMIN" || userRole === "EDITOR";

  // Fetch all asset types that have at least one stock item (for filter tabs)
  const types = await prisma.assetType.findMany({
    where: { stockItems: { some: {} } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const allItems = await prisma.stockItem.findMany({
    include: { type: true, manufacturer: true },
    orderBy: { createdAt: "desc" },
  });

  const totalUnits = allItems.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-[9px] bg-[#e8f0fc] flex items-center justify-center flex-shrink-0">
            <Package className="h-4 w-4 text-[#1e64c8]" />
          </div>
          <div>
            <h1 className="text-[22px] font-bold text-[#0f172a] tracking-[-0.01em]">Stock</h1>
            <p className="text-[13px] text-[#64748b] mt-0.5">
              {allItems.length} item{allItems.length !== 1 ? "s" : ""}
              {allItems.length > 0 && ` · ${totalUnits} unit${totalUnits !== 1 ? "s" : ""} total`}
            </p>
          </div>
        </div>
        {canEdit && (
          <StockItemFormDialog mode="create">
            <Button size="sm" className="bg-[#1e64c8] hover:bg-[#1a56b0] text-white flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Add stock item
            </Button>
          </StockItemFormDialog>
        )}
      </div>

      {/* Type filter tabs */}
      {types.length > 1 && (
        <StockTypeFilter types={types} allItems={allItems} userRole={userRole} />
      )}

      {/* Table — show all items when few/no types */}
      {types.length <= 1 && (
        <StockItemTable items={allItems} userRole={userRole} />
      )}
    </div>
  );
}

// Client component for tab-based type filtering
import type { StockItem } from "@/components/stock/stock-item-table";

function StockTypeFilter({
  types,
  allItems,
  userRole,
}: {
  types: { id: string; name: string }[];
  allItems: StockItem[];
  userRole: string;
}) {
  // Server component — render all types as sections
  return (
    <div className="space-y-8">
      {types.map((t) => {
        const typeItems = allItems.filter((i) => i.type.id === t.id);
        return (
          <section key={t.id}>
            <h2 className="text-[14px] font-semibold text-[#0f172a] mb-3 flex items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#e8f0fc] text-[#1e64c8] text-[11px] font-medium">
                {t.name}
              </span>
              <span className="text-[12px] text-[#94a3b8] font-normal">{typeItems.length} item{typeItems.length !== 1 ? "s" : ""}</span>
            </h2>
            <StockItemTable items={typeItems} userRole={userRole} />
          </section>
        );
      })}
    </div>
  );
}
