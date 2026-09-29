"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArchiveX, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

type StockTypeNode = { id: string; name: string };

export function StockNavItems({
  stockTypes,
  stockItemCount,
  decommissionedCount,
  inRepairCount,
}: {
  stockTypes: StockTypeNode[];
  stockItemCount: number;
  decommissionedCount: number;
  inRepairCount: number;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTypeId = searchParams.get("typeId");
  const isStockPath = pathname === "/stock";
  const allActive = isStockPath && !currentTypeId;
  const isDecommissioned = pathname === "/decommissioned";
  const isInRepair = pathname === "/in-repair";

  return (
    <div>
      <Link
        href="/stock"
        className={cn(
          "flex items-center gap-1.5 py-[5px] pl-[40px] pr-[10px] text-[12px] select-none",
          allActive
            ? "bg-[#e8f0fc] text-[#1e64c8] font-semibold border-r-[3px] border-[#1e64c8]"
            : "text-[#334155] hover:bg-[#f8fafc]"
        )}
      >
        <span className="flex-1 truncate">{t("allItems")}</span>
        {stockItemCount > 0 && (
          <span className="text-[11px] text-[#64748b] bg-[#f1f5f9] px-1.5 py-0 rounded flex-shrink-0 leading-5">
            {stockItemCount}
          </span>
        )}
      </Link>

      {stockTypes.map((t) => {
        const isActive = isStockPath && currentTypeId === t.id;
        return (
          <Link
            key={t.id}
            href={`/stock?typeId=${t.id}`}
            className={cn(
              "flex items-center py-[5px] pl-[40px] pr-[10px] text-[12px] select-none",
              isActive
                ? "bg-[#e8f0fc] text-[#1e64c8] font-semibold border-r-[3px] border-[#1e64c8]"
                : "text-[#334155] hover:bg-[#f8fafc]"
            )}
          >
            <span className="truncate">{t.name}</span>
          </Link>
        );
      })}

      <div className="mx-3 my-1 h-px bg-[#f1f5f9]" />
      <Link
        href="/decommissioned"
        className={cn(
          "flex items-center gap-1.5 py-[5px] pl-[40px] pr-[10px] text-[12px] select-none",
          isDecommissioned
            ? "bg-[#f1f5f9] text-[#64748b] font-semibold border-r-[3px] border-[#94a3b8]"
            : "text-[#64748b] hover:bg-[#f8fafc]"
        )}
      >
        <ArchiveX className={cn("h-3 w-3 flex-shrink-0", isDecommissioned ? "text-[#64748b]" : "text-[#94a3b8]")} />
        <span className="flex-1 truncate">{t("decommissioned")}</span>
        {decommissionedCount > 0 && (
          <span className="text-[11px] text-[#94a3b8] bg-[#f1f5f9] px-1.5 py-0 rounded flex-shrink-0 leading-5">
            {decommissionedCount}
          </span>
        )}
      </Link>
      <Link
        href="/in-repair"
        className={cn(
          "flex items-center gap-1.5 py-[5px] pl-[40px] pr-[10px] text-[12px] select-none",
          isInRepair
            ? "bg-[#f1f5f9] text-[#64748b] font-semibold border-r-[3px] border-[#94a3b8]"
            : "text-[#64748b] hover:bg-[#f8fafc]"
        )}
      >
        <Wrench className={cn("h-3 w-3 flex-shrink-0", isInRepair ? "text-[#64748b]" : "text-[#94a3b8]")} />
        <span className="flex-1 truncate">{t("inRepair")}</span>
        {inRepairCount > 0 && (
          <span className="text-[11px] text-[#94a3b8] bg-[#f1f5f9] px-1.5 py-0 rounded flex-shrink-0 leading-5">
            {inRepairCount}
          </span>
        )}
      </Link>
    </div>
  );
}
