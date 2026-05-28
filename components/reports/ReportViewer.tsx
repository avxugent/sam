"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Download, Pencil, Search, ExternalLink, ChevronUp, ChevronDown } from "lucide-react";
import type { ReportResult, ColumnKey } from "@/lib/report-types";


function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <ChevronUp className="h-2.5 w-2.5 opacity-30" />;
  return dir === "asc"
    ? <ChevronUp className="h-2.5 w-2.5 text-[#1e64c8]" />
    : <ChevronDown className="h-2.5 w-2.5 text-[#1e64c8]" />;
}

type Props = {
  reportId: string;
  reportName: string;
  columns: ColumnKey[];
  result: ReportResult;
  canEdit: boolean;
  grafanaUrl?: string | null;
};

export function ReportViewer({ reportId, reportName, columns, result, canEdit, grafanaUrl }: Props) {
  const { toast } = useToast();
  const t = useTranslations("report");
  const tCommon = useTranslations("common");
  const tField = useTranslations("field");
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<ColumnKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function handleSort(col: ColumnKey) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }

  const columnLabels: Record<ColumnKey, string> = {
    model: tField("model"),
    serialNumber: tField("serialNumber"),
    hostname: tField("hostname"),
    type: tField("type"),
    manufacturer: tField("manufacturer"),
    location: tField("location"),
    installationDate: tField("installed"),
    invoiceDate: tField("invoiceDate"),
    invoiceNumber: tField("invoiceNumber"),
    notes: tField("notes"),
    lastChanged: tField("lastModified"),
  };

  const filtered = result.rows.filter((row) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return columns.some((col) => (row[col] as string | null)?.toLowerCase().includes(q));
  });

  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    return [...filtered].sort((a, b) => {
      const av = String(a[sortCol] ?? "");
      const bv = String(b[sortCol] ?? "");
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [filtered, sortCol, sortDir]);

  async function handleExport() {
    const res = await fetch(`/api/reports/${reportId}/export`);
    if (!res.ok) {
      toast({ title: tCommon("error"), variant: "destructive" });
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${reportName.replace(/[^a-z0-9]/gi, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      {/* Summary bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[13px] text-[#64748b]">
            {t("resultCount", { count: result.total })}
          </span>
          {result.groups.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {result.groups.slice(0, 8).map((g) => (
                <span
                  key={g.label}
                  className="inline-flex items-center gap-1 text-[11px] bg-[#f1f5f9] text-[#334155] px-2 py-0.5 rounded-full"
                >
                  <span className="font-medium">{g.label}</span>
                  <span className="text-[#94a3b8]">{g.count}</span>
                </span>
              ))}
              {result.groups.length > 8 && (
                <span className="text-[11px] text-[#94a3b8]">{t("moreGroups", { count: result.groups.length - 8 })}</span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {grafanaUrl && (
            <Button variant="outline" size="sm" className="h-[34px] text-[12.5px] gap-1.5" asChild>
              <a href={grafanaUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                {tCommon("open")}
              </a>
            </Button>
          )}
          {canEdit && (
            <Button variant="outline" size="sm" className="h-[34px] text-[12.5px] gap-1.5" asChild>
              <Link href={`/reports/${reportId}/edit`}>
                <Pencil className="h-3.5 w-3.5" />
                {tCommon("edit")}
              </Link>
            </Button>
          )}
          <Button size="sm" className="h-[34px] text-[12.5px] gap-1.5" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" />
            {t("exportCsv")}
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t("filterResults")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-[36px] text-[13px] rounded-[8px]"
        />
      </div>

      {/* Table */}
      <div className="rounded-[10px] border border-[#e2e8f0] overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <caption className="sr-only">{reportName}: {result.total}</caption>
            <thead>
              <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                {columns.map((col) => {
                  const active = sortCol === col;
                  const ariaSort: "ascending" | "descending" | "none" = active
                    ? sortDir === "asc" ? "ascending" : "descending"
                    : "none";
                  return (
                    <th
                      key={col}
                      scope="col"
                      aria-sort={ariaSort}
                      className="text-left px-4 py-[10px] text-[12px] font-medium text-[#64748b] whitespace-nowrap cursor-pointer select-none hover:bg-[#f1f5f9]"
                      onClick={() => handleSort(col)}
                    >
                      <div className="flex items-center gap-1">
                        {columnLabels[col]}
                        <SortIcon active={active} dir={sortDir} />
                      </div>
                    </th>
                  );
                })}
                <th scope="col" className="text-right px-4 py-[10px] text-[12px] font-medium text-[#64748b]">{tCommon("view")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1} className="text-center py-10 text-[#64748b]">
                    {search ? t("noMatchingResults") : t("noResults")}
                  </td>
                </tr>
              ) : (
                sorted.map((row) => (
                  <tr key={row.id} className="border-b border-[#e2e8f0] last:border-0 hover:bg-[#f8fafc] transition-colors">
                    {columns.map((col) => {
                      const val = row[col] as string | null;
                      if (col === "type" && val) {
                        return (
                          <td key={col} className="px-4 py-[10px]">
                            <span className="inline-flex items-center text-[11px] font-semibold bg-[#e8f0fc] text-[#1e64c8] px-2 py-0.5 rounded-[5px]">
                              {val}
                            </span>
                          </td>
                        );
                      }
                      if ((col === "serialNumber" || col === "hostname") && val) {
                        return (
                          <td key={col} className="px-4 py-[10px] font-mono text-[11.5px] text-[#64748b]">
                            {val}
                          </td>
                        );
                      }
                      return (
                        <td key={col} className="px-4 py-[10px] text-[#64748b]">
                          {val ?? <span className="italic text-[#94a3b8]">—</span>}
                        </td>
                      );
                    })}
                    <td className="px-4 py-[10px] text-right">
                      {row.locationId && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-[30px] w-[30px] border border-[#e2e8f0] rounded-md bg-[#f8fafc] hover:bg-white"
                          aria-label={`${tCommon("view")} ${row.model || row.hostname || row.serialNumber || row.id}`}
                          asChild
                        >
                          <Link href={`/locations/${row.locationId}/assets/${row.id}`}>
                            <ExternalLink className="h-3.5 w-3.5 text-[#1e64c8]" />
                          </Link>
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {sorted.length < result.total && search && (
        <p className="text-[12px] text-[#64748b] text-center">
          {t("showingOf", { n: sorted.length, total: result.total })}
        </p>
      )}
    </div>
  );
}
