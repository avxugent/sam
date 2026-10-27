"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { SortableTh } from "@/components/ui/sortable-th";

type SortCol = "type" | "model" | "serialNumber" | "location" | "repairStartedAt";

export type InRepairAsset = {
  id: string;
  locationId: string;
  model: { name: string } | null;
  serialNumber: string | null;
  repairStartedAt: Date | string | null;
  repairNote: string | null;
  type: { id: string; name: string } | null;
  manufacturer: { id: string; name: string } | null;
  location: { id: string; name: string } | null;
};

export function InRepairTable({ assets }: { assets: InRepairAsset[] }) {
  const t = useTranslations("repair");
  const tStock = useTranslations("stock");
  const tAsset = useTranslations("asset");
  const [query, setQuery] = useState("");
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }

  const filtered = assets.filter((a) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      a.model?.name.toLowerCase().includes(q) ||
      a.serialNumber?.toLowerCase().includes(q) ||
      a.type?.name.toLowerCase().includes(q) ||
      a.manufacturer?.name.toLowerCase().includes(q) ||
      a.location?.name.toLowerCase().includes(q) ||
      a.repairNote?.toLowerCase().includes(q)
    );
  });

  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    return [...filtered].sort((a, b) => {
      let av = "", bv = "";
      if (sortCol === "type") { av = a.type?.name ?? ""; bv = b.type?.name ?? ""; }
      else if (sortCol === "model") { av = a.model?.name ?? ""; bv = b.model?.name ?? ""; }
      else if (sortCol === "serialNumber") { av = a.serialNumber ?? ""; bv = b.serialNumber ?? ""; }
      else if (sortCol === "location") { av = a.location?.name ?? ""; bv = b.location?.name ?? ""; }
      else if (sortCol === "repairStartedAt") { av = String(a.repairStartedAt ?? ""); bv = String(b.repairStartedAt ?? ""); }
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [filtered, sortCol, sortDir]);

  return (
    <div className="space-y-3">
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#94a3b8]" />
        <Input
          placeholder={t("searchInRepair")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8 h-8 text-[13px]"
        />
      </div>

      <div className="border border-[#e2e8f0] rounded-[10px] overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-[#f8fafc] border-b border-[#e2e8f0]">
            <tr>
              <SortableTh variant="compact" col="type" label={tStock("type")} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <SortableTh variant="compact" col="model" label={tStock("model")} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <SortableTh variant="compact" col="serialNumber" label={tStock("serial")} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <SortableTh variant="compact" col="location" label={t("lastLocation")} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <SortableTh variant="compact" col="repairStartedAt" label={t("repairStartedAt")} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-[#64748b] uppercase tracking-wide">{t("note")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f5f9]">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-[13px] text-[#94a3b8]">
                  {t("noInRepair")}
                </td>
              </tr>
            ) : (
              sorted.map((asset) => (
                <tr key={asset.id} className="hover:bg-[#f8fafc] transition-colors">
                  <td className="px-3 py-2.5">
                    {asset.type ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#f1f5f9] text-[#64748b] text-[11px] font-medium">
                        {asset.type.name}
                      </span>
                    ) : <span className="text-[#cbd5e1]">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/locations/${asset.locationId}/assets/${asset.id}`}
                      className="font-medium text-[#0f172a] hover:text-[#1e64c8] hover:underline"
                    >
                      {asset.model?.name || asset.serialNumber || tAsset("unnamedAsset")}
                    </Link>
                    {asset.manufacturer && (
                      <span className="text-[11.5px] text-[#94a3b8] ml-1.5">{asset.manufacturer.name}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {asset.serialNumber
                      ? <span className="font-mono text-[11.5px] text-[#64748b]">{asset.serialNumber}</span>
                      : <span className="text-[#cbd5e1]">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-[#64748b]">
                    <span className="text-[#334155]">{asset.location?.name ?? "—"}</span>
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-[#64748b]">
                    {asset.repairStartedAt ? formatDate(asset.repairStartedAt) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-[#64748b] max-w-[200px] truncate">
                    {asset.repairNote || <span className="text-[#cbd5e1]">—</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
