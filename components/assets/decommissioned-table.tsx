"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import { Search, RotateCcw, ChevronUp, ChevronDown } from "lucide-react";
import { formatDate } from "@/lib/utils";
import * as permissions from "@/lib/permissions";
import type { Role } from "@/lib/permissions";

type SortCol = "type" | "model" | "serialNumber" | "lastLocation" | "decommissionedAt";

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <ChevronUp className="h-2.5 w-2.5 opacity-30" />;
  return dir === "asc"
    ? <ChevronUp className="h-2.5 w-2.5 text-[#1e64c8]" />
    : <ChevronDown className="h-2.5 w-2.5 text-[#1e64c8]" />;
}

function Th({ col, label, sortCol, sortDir, onSort }: {
  col: SortCol; label: string;
  sortCol: SortCol | null; sortDir: "asc" | "desc";
  onSort: (col: SortCol) => void;
}) {
  const active = sortCol === col;
  const ariaSort: "ascending" | "descending" | "none" = active
    ? sortDir === "asc" ? "ascending" : "descending"
    : "none";
  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className="px-3 py-2.5 text-left text-[11px] font-semibold text-[#64748b] uppercase tracking-wide cursor-pointer select-none hover:bg-[#f1f5f9]"
      onClick={() => onSort(col)}
    >
      <div className="flex items-center gap-1">
        {label}
        <SortIcon active={active} dir={sortDir} />
      </div>
    </th>
  );
}

export type DecommissionedAsset = {
  id: string;
  locationId: string;
  model: { name: string } | null;
  serialNumber: string | null;
  decommissionedAt: Date | string | null;
  decommissionNote: string | null;
  lastLocationName: string | null;
  lastLocationFiNumber: string | null;
  type: { id: string; name: string } | null;
  manufacturer: { id: string; name: string } | null;
};

export function DecommissionedTable({
  assets: initialAssets,
  userRole,
}: {
  assets: DecommissionedAsset[];
  userRole: Role;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("decommissioned");
  const tStock = useTranslations("stock");
  const tCommon = useTranslations("common");
  const tAsset = useTranslations("asset");
  const [assets, setAssets] = useState(initialAssets);
  const [query, setQuery] = useState("");
  const isAdmin = permissions.isAdmin(userRole);
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
      a.lastLocationName?.toLowerCase().includes(q) ||
      a.decommissionNote?.toLowerCase().includes(q)
    );
  });

  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    return [...filtered].sort((a, b) => {
      let av = "", bv = "";
      if (sortCol === "type") { av = a.type?.name ?? ""; bv = b.type?.name ?? ""; }
      else if (sortCol === "model") { av = a.model?.name ?? ""; bv = b.model?.name ?? ""; }
      else if (sortCol === "serialNumber") { av = a.serialNumber ?? ""; bv = b.serialNumber ?? ""; }
      else if (sortCol === "lastLocation") { av = a.lastLocationName ?? ""; bv = b.lastLocationName ?? ""; }
      else if (sortCol === "decommissionedAt") { av = String(a.decommissionedAt ?? ""); bv = String(b.decommissionedAt ?? ""); }
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [filtered, sortCol, sortDir]);

  async function handleReinstate(id: string) {
    const res = await fetch(`/api/assets/${id}/reinstate`, { method: "POST" });
    if (!res.ok) {
      const err = await res.json();
      toast({ title: "Error", description: err.error, variant: "destructive" });
      return;
    }
    setAssets((prev) => prev.filter((a) => a.id !== id));
    toast({ title: t("reinstated") });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#94a3b8]" />
        <Input
          placeholder={t("searchDecommissioned")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8 h-8 text-[13px]"
        />
      </div>

      <div className="border border-[#e2e8f0] rounded-[10px] overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-[#f8fafc] border-b border-[#e2e8f0]">
            <tr>
              <Th col="type" label={tStock("type")} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <Th col="model" label={tStock("model")} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <Th col="serialNumber" label={tStock("serial")} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <Th col="lastLocation" label={t("lastLocation")} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <Th col="decommissionedAt" label={t("decommissioned")} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-[#64748b] uppercase tracking-wide">{t("note")}</th>
              {isAdmin && <th className="px-3 py-2.5 w-[60px]" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f5f9]">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 7 : 6} className="px-3 py-8 text-center text-[13px] text-[#94a3b8]">
                  {t("noDecommissioned")}
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
                    <span className="text-[#334155]">{asset.lastLocationName ?? "—"}</span>
                    {asset.lastLocationFiNumber && (
                      <span className="ml-1.5 font-mono text-[11px] text-[#94a3b8]">{asset.lastLocationFiNumber}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-[#64748b]">
                    {asset.decommissionedAt ? formatDate(asset.decommissionedAt) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-[#64748b] max-w-[200px] truncate">
                    {asset.decommissionNote || <span className="text-[#cbd5e1]">—</span>}
                  </td>
                  {isAdmin && (
                    <td className="px-3 py-2.5">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-[#e8f0fc]" title={t("reinstate")}>
                            <RotateCcw className="h-3.5 w-3.5 text-[#1e64c8]" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {t("reinstateConfirmTitle", { name: asset.model?.name || asset.serialNumber || tStock("item") })}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {t("reinstateConfirmDescription", { location: asset.lastLocationName ?? t("itsLocation") })}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleReinstate(asset.id)}
                              className="bg-[#1e64c8] hover:bg-[#1a56b0] text-white"
                            >
                              {t("reinstate")}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
