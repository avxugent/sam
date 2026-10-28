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
            ? "bg-primary-tint text-primary font-semibold border-r-[3px] border-primary"
            : "text-secondary-foreground hover:bg-background"
        )}
      >
        <span className="flex-1 truncate">{t("allItems")}</span>
        {stockItemCount > 0 && (
          <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0 rounded flex-shrink-0 leading-5">
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
                ? "bg-primary-tint text-primary font-semibold border-r-[3px] border-primary"
                : "text-secondary-foreground hover:bg-background"
            )}
          >
            <span className="truncate">{t.name}</span>
          </Link>
        );
      })}

      <div className="mx-3 my-1 h-px bg-muted" />
      <Link
        href="/decommissioned"
        className={cn(
          "flex items-center gap-1.5 py-[5px] pl-[40px] pr-[10px] text-[12px] select-none",
          isDecommissioned
            ? "bg-muted text-muted-foreground font-semibold border-r-[3px] border-subtle"
            : "text-muted-foreground hover:bg-background"
        )}
      >
        <ArchiveX className={cn("h-3 w-3 flex-shrink-0", isDecommissioned ? "text-muted-foreground" : "text-subtle")} />
        <span className="flex-1 truncate">{t("decommissioned")}</span>
        {decommissionedCount > 0 && (
          <span className="text-[11px] text-subtle bg-muted px-1.5 py-0 rounded flex-shrink-0 leading-5">
            {decommissionedCount}
          </span>
        )}
      </Link>
      <Link
        href="/in-repair"
        className={cn(
          "flex items-center gap-1.5 py-[5px] pl-[40px] pr-[10px] text-[12px] select-none",
          isInRepair
            ? "bg-muted text-muted-foreground font-semibold border-r-[3px] border-subtle"
            : "text-muted-foreground hover:bg-background"
        )}
      >
        <Wrench className={cn("h-3 w-3 flex-shrink-0", isInRepair ? "text-muted-foreground" : "text-subtle")} />
        <span className="flex-1 truncate">{t("inRepair")}</span>
        {inRepairCount > 0 && (
          <span className="text-[11px] text-subtle bg-muted px-1.5 py-0 rounded flex-shrink-0 leading-5">
            {inRepairCount}
          </span>
        )}
      </Link>
    </div>
  );
}
