"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ExternalLink, ChevronUp, ChevronDown } from "lucide-react";
import type { AssetReportResult, ColumnKey } from "@/lib/reports/types";
import { ReportToolbar } from "@/components/reports/report-toolbar";

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <ChevronUp className="h-2.5 w-2.5 opacity-30" />;
  return dir === "asc"
    ? <ChevronUp className="h-2.5 w-2.5 text-primary" />
    : <ChevronDown className="h-2.5 w-2.5 text-primary" />;
}

type Props = {
  reportId: string;
  reportName: string;
  columns: ColumnKey[];
  result: AssetReportResult;
  canEdit: boolean;
  grafanaUrl?: string | null;
};

export function ReportViewer({ reportId, reportName, columns, result, canEdit, grafanaUrl }: Props) {
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
    supplier: tField("supplier"),
    criticality: tField("criticality"),
    endOfSupportDate: tField("endOfSupport"),
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

  return (
    <div className="space-y-5">
      <ReportToolbar
        reportId={reportId}
        reportName={reportName}
        canEdit={canEdit}
        grafanaUrl={grafanaUrl}
        search={search}
        onSearchChange={setSearch}
        summary={
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[13px] text-muted-foreground">
              {t("resultCount", { count: result.total })}
            </span>
            {result.groups.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {result.groups.slice(0, 8).map((g) => (
                  <span
                    key={g.label}
                    className="inline-flex items-center gap-1 text-[11px] bg-muted text-secondary-foreground px-2 py-0.5 rounded-full"
                  >
                    <span className="font-medium">{g.label}</span>
                    <span className="text-subtle">{g.count}</span>
                  </span>
                ))}
                {result.groups.length > 8 && (
                  <span className="text-[11px] text-subtle">{t("moreGroups", { count: result.groups.length - 8 })}</span>
                )}
              </div>
            )}
          </div>
        }
      />

      {/* Table */}
      <div className="rounded-[10px] border border-border overflow-hidden bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <caption className="sr-only">{reportName}: {result.total}</caption>
            <thead>
              <tr className="border-b border-border bg-background">
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
                      className="text-left px-4 py-[10px] text-[12px] font-medium text-muted-foreground whitespace-nowrap cursor-pointer select-none hover:bg-muted"
                      onClick={() => handleSort(col)}
                    >
                      <div className="flex items-center gap-1">
                        {columnLabels[col]}
                        <SortIcon active={active} dir={sortDir} />
                      </div>
                    </th>
                  );
                })}
                <th scope="col" className="text-right px-4 py-[10px] text-[12px] font-medium text-muted-foreground">{tCommon("view")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1} className="text-center py-10 text-muted-foreground">
                    {search ? t("noMatchingResults") : t("noResults")}
                  </td>
                </tr>
              ) : (
                sorted.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0 hover:bg-background transition-colors">
                    {columns.map((col) => {
                      const val = row[col] as string | null;
                      if (col === "type" && val) {
                        return (
                          <td key={col} className="px-4 py-[10px]">
                            <span className="inline-flex items-center text-[11px] font-semibold bg-primary-tint text-primary px-2 py-0.5 rounded-[5px]">
                              {val}
                            </span>
                          </td>
                        );
                      }
                      if ((col === "serialNumber" || col === "hostname") && val) {
                        return (
                          <td key={col} className="px-4 py-[10px] font-mono text-[11.5px] text-muted-foreground">
                            {val}
                          </td>
                        );
                      }
                      return (
                        <td key={col} className="px-4 py-[10px] text-muted-foreground">
                          {val ?? <span className="italic text-subtle">—</span>}
                        </td>
                      );
                    })}
                    <td className="px-4 py-[10px] text-right">
                      {row.locationId && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-[30px] w-[30px] border border-border rounded-md bg-background hover:bg-card"
                          aria-label={`${tCommon("view")} ${row.model || row.hostname || row.serialNumber || row.id}`}
                          asChild
                        >
                          <Link href={`/locations/${row.locationId}/assets/${row.id}`}>
                            <ExternalLink className="h-3.5 w-3.5 text-primary" />
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

      {sorted.length < result.total && (
        <p className="text-[12px] text-muted-foreground text-center">
          {t("showingOf", { n: sorted.length, total: result.total })}
        </p>
      )}
    </div>
  );
}
