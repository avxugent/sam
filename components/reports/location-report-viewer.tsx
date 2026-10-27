"use client";

import { Fragment, useState, useMemo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Download, Pencil, Search, ExternalLink, Check, X } from "lucide-react";
import type { LocationReportResult } from "@/lib/reports/types";

type Props = {
  reportId: string;
  reportName: string;
  result: LocationReportResult;
  canEdit: boolean;
};

export function LocationReportViewer({ reportId, reportName, result, canEdit }: Props) {
  const { toast } = useToast();
  const t = useTranslations("report");
  const tCommon = useTranslations("common");
  const tField = useTranslations("field");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return result.rows;
    const q = search.toLowerCase();
    return result.rows.filter(
      (row) =>
        row.path.toLowerCase().includes(q) ||
        row.name.toLowerCase().includes(q) ||
        row.fiNumber?.toLowerCase().includes(q)
    );
  }, [result.rows, search]);

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
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[13px] text-[#64748b]">{t("resultCount", { count: result.total })}</span>
          <span className="inline-flex items-center gap-1 text-[11px] bg-[#dcfce7] text-[#166534] px-2 py-0.5 rounded-full">
            <Check className="h-3 w-3" />
            {t("filledCount", { count: result.filledCount })}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] bg-[#fee2e2] text-[#991b1b] px-2 py-0.5 rounded-full">
            <X className="h-3 w-3" />
            {t("notFilledCount", { count: result.notFilledCount })}
          </span>
        </div>

        <div className="flex items-center gap-2">
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
                <th scope="col" className="text-left px-4 py-[10px] text-[12px] font-medium text-[#64748b] whitespace-nowrap">
                  {tField("location")}
                </th>
                <th scope="col" className="text-left px-4 py-[10px] text-[12px] font-medium text-[#64748b] whitespace-nowrap">
                  {tField("fiNumber")}
                </th>
                {result.itemColumns.map((c) => (
                  <th key={c.id} scope="col" className="text-left px-4 py-[10px] text-[12px] font-medium text-[#64748b] whitespace-nowrap">
                    {c.name}
                  </th>
                ))}
                <th scope="col" className="text-right px-4 py-[10px] text-[12px] font-medium text-[#64748b]">{tCommon("view")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={result.itemColumns.length + 3} className="text-center py-10 text-[#64748b]">
                    {search ? t("noMatchingResults") : t("noResults")}
                  </td>
                </tr>
              ) : (
                filtered.map((row, i) => {
                  const groupLabel = [row.campus, row.building].filter(Boolean).join(" / ");
                  const prev = filtered[i - 1];
                  const prevLabel = prev ? [prev.campus, prev.building].filter(Boolean).join(" / ") : null;
                  const showGroup = groupLabel && groupLabel !== prevLabel;
                  return (
                    <Fragment key={row.id}>
                      {showGroup && (
                        <tr className="bg-[#f1f5f9]">
                          <th
                            scope="colgroup"
                            colSpan={result.itemColumns.length + 3}
                            className="text-left px-4 py-[6px] text-[11px] font-semibold uppercase tracking-wider text-[#475569]"
                          >
                            {groupLabel}
                          </th>
                        </tr>
                      )}
                      <tr className="border-b border-[#e2e8f0] last:border-0 hover:bg-[#f8fafc] transition-colors">
                        <td className="px-4 py-[10px] text-[#334155]">{row.name}</td>
                        <td className="px-4 py-[10px] font-mono text-[11.5px] text-[#64748b]">
                          {row.fiNumber ?? <span className="italic text-[#94a3b8] font-sans">—</span>}
                        </td>
                        {result.itemColumns.map((c) => {
                          const s = row.items[c.id];
                          if (s?.filled) {
                            return (
                              <td key={c.id} className="px-4 py-[10px]">
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#166534]">
                                  <Check className="h-3.5 w-3.5" />
                                  {s.date ?? t("filled")}
                                </span>
                              </td>
                            );
                          }
                          // Not filled within the window. If there is an older
                          // entry, surface its date (overdue) instead of nothing.
                          return (
                            <td key={c.id} className="px-4 py-[10px]">
                              <span className="inline-flex items-center gap-1 text-[11px] text-[#b45309]" title={s?.date ? t("overdue") : undefined}>
                                <X className="h-3.5 w-3.5" />
                                {s?.date ?? t("notFilled")}
                              </span>
                            </td>
                          );
                        })}
                        <td className="px-4 py-[10px] text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-[30px] w-[30px] border border-[#e2e8f0] rounded-md bg-[#f8fafc] hover:bg-white"
                            aria-label={`${tCommon("view")} ${row.name}`}
                            asChild
                          >
                            <Link href={`/locations/${row.locationId}`}>
                              <ExternalLink className="h-3.5 w-3.5 text-[#1e64c8]" />
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
