"use client";

import { Fragment, useState, useMemo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ExternalLink, Check, X } from "lucide-react";
import type { LocationReportResult } from "@/lib/reports/types";
import { ReportToolbar } from "@/components/reports/report-toolbar";

type Props = {
  reportId: string;
  reportName: string;
  result: LocationReportResult;
  canEdit: boolean;
};

export function LocationReportViewer({ reportId, reportName, result, canEdit }: Props) {
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

  return (
    <div className="space-y-5">
      <ReportToolbar
        reportId={reportId}
        reportName={reportName}
        canEdit={canEdit}
        search={search}
        onSearchChange={setSearch}
        summary={
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[13px] text-muted-foreground">{t("resultCount", { count: result.total })}</span>
            <span className="inline-flex items-center gap-1 text-[11px] bg-[#dcfce7] text-[#166534] px-2 py-0.5 rounded-full">
              <Check className="h-3 w-3" />
              {t("filledCount", { count: result.filledCount })}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] bg-[#fee2e2] text-[#991b1b] px-2 py-0.5 rounded-full">
              <X className="h-3 w-3" />
              {t("notFilledCount", { count: result.notFilledCount })}
            </span>
          </div>
        }
      />

      <div className="rounded-[10px] border border-border overflow-hidden bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <caption className="sr-only">{reportName}: {result.total}</caption>
            <thead>
              <tr className="border-b border-border bg-background">
                <th scope="col" className="text-left px-4 py-[10px] text-[12px] font-medium text-muted-foreground whitespace-nowrap">
                  {tField("location")}
                </th>
                <th scope="col" className="text-left px-4 py-[10px] text-[12px] font-medium text-muted-foreground whitespace-nowrap">
                  {tField("fiNumber")}
                </th>
                {result.itemColumns.map((c) => (
                  <th key={c.id} scope="col" className="text-left px-4 py-[10px] text-[12px] font-medium text-muted-foreground whitespace-nowrap">
                    {c.name}
                  </th>
                ))}
                <th scope="col" className="text-right px-4 py-[10px] text-[12px] font-medium text-muted-foreground">{tCommon("view")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={result.itemColumns.length + 3} className="text-center py-10 text-muted-foreground">
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
                        <tr className="bg-muted">
                          <th
                            scope="colgroup"
                            colSpan={result.itemColumns.length + 3}
                            className="text-left px-4 py-[6px] text-[11px] font-semibold uppercase tracking-wider text-secondary-foreground"
                          >
                            {groupLabel}
                          </th>
                        </tr>
                      )}
                      <tr className="border-b border-border last:border-0 hover:bg-background transition-colors">
                        <td className="px-4 py-[10px] text-secondary-foreground">{row.name}</td>
                        <td className="px-4 py-[10px] font-mono text-[11.5px] text-muted-foreground">
                          {row.fiNumber ?? <span className="italic text-subtle font-sans">—</span>}
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
                            className="h-[30px] w-[30px] border border-border rounded-md bg-background hover:bg-card"
                            aria-label={`${tCommon("view")} ${row.name}`}
                            asChild
                          >
                            <Link href={`/locations/${row.locationId}`}>
                              <ExternalLink className="h-3.5 w-3.5 text-primary" />
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
