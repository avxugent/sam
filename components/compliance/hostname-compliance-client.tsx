"use client";

import { Fragment, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Download, Loader2 } from "lucide-react";
import type { HostnameComplianceResult, TypeCompliance } from "@/lib/hostname-compliance";

function formatRate(rate: number | null): string | null {
  if (rate === null) return null;
  return `${(rate * 100).toFixed(1)}%`;
}

function rateColor(rate: number | null): string {
  if (rate === null) return "text-[#64748b]";
  if (rate >= 0.95) return "text-[#16a34a]";
  if (rate >= 0.8) return "text-[#ca8a04]";
  return "text-[#dc2626]";
}

export function HostnameComplianceClient({ result }: { result: HostnameComplianceResult }) {
  const t = useTranslations("compliance");
  const tCommon = useTranslations("common");
  const { toast } = useToast();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const hasNonCompliant = result.overall.nonCompliant > 0;

  async function handleExport() {
    setDownloading(true);
    try {
      const res = await fetch("/api/compliance/hostname/export");
      if (!res.ok) {
        toast({ title: tCommon("error"), variant: "destructive" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `sam-hostname-noncompliant-${date}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  function bucketKey(row: TypeCompliance): string {
    return row.typeId ?? "__none__";
  }

  return (
    <div className="space-y-5">
      {/* Overall summary + export */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[10px] border border-[#e2e8f0] bg-white p-5">
        <div>
          <p className="text-[12px] font-medium text-[#64748b]">{t("overallRate")}</p>
          <p className={cn("text-[28px] font-bold tracking-[-0.01em]", rateColor(result.overall.rate))}>
            {formatRate(result.overall.rate) ?? t("notApplicable")}
          </p>
          <p className="text-[12px] text-[#64748b] mt-0.5">
            {result.overall.compliant} / {result.overall.measured} {t("compliant").toLowerCase()}
          </p>
        </div>
        <Button onClick={handleExport} disabled={downloading || !hasNonCompliant} className="gap-2">
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {t("exportNonCompliant")}
        </Button>
      </div>

      {/* Per-type table */}
      <div className="rounded-[10px] border border-[#e2e8f0] overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <caption className="sr-only">{t("title")}</caption>
            <thead>
              <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                <th scope="col" className="text-left px-4 py-[10px] text-[12px] font-medium text-[#64748b] whitespace-nowrap">{t("assetType")}</th>
                <th scope="col" className="text-left px-4 py-[10px] text-[12px] font-medium text-[#64748b] whitespace-nowrap hidden md:table-cell">{t("pattern")}</th>
                <th scope="col" className="text-right px-4 py-[10px] text-[12px] font-medium text-[#64748b] whitespace-nowrap">{t("measured")}</th>
                <th scope="col" className="text-right px-4 py-[10px] text-[12px] font-medium text-[#64748b] whitespace-nowrap">{t("compliant")}</th>
                <th scope="col" className="text-right px-4 py-[10px] text-[12px] font-medium text-[#64748b] whitespace-nowrap">{t("nonCompliant")}</th>
                <th scope="col" className="text-right px-4 py-[10px] text-[12px] font-medium text-[#64748b] whitespace-nowrap hidden sm:table-cell">{t("noHostname")}</th>
                <th scope="col" className="text-right px-4 py-[10px] text-[12px] font-medium text-[#64748b] whitespace-nowrap">{t("rate")}</th>
                <th scope="col" className="px-4 py-[10px]"><span className="sr-only">{t("showNonCompliant")}</span></th>
              </tr>
            </thead>
            <tbody>
              {result.types.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-[#64748b]">{t("noData")}</td>
                </tr>
              ) : (
                result.types.map((row) => {
                  const key = bucketKey(row);
                  const canExpand = row.nonCompliantAssets.length > 0;
                  const isOpen = expanded === key;
                  return (
                    <Fragment key={key}>
                      <tr
                        role={canExpand ? "button" : undefined}
                        tabIndex={canExpand ? 0 : undefined}
                        aria-expanded={canExpand ? isOpen : undefined}
                        aria-label={canExpand ? `${t("showNonCompliant")} — ${row.typeName}` : undefined}
                        className={cn(
                          "border-b border-[#e2e8f0] last:border-0",
                          canExpand && "cursor-pointer hover:bg-[#f8fafc] focus-visible:outline-none focus-visible:bg-[#e8f0fc]"
                        )}
                        onClick={() => canExpand && setExpanded(isOpen ? null : key)}
                        onKeyDown={(e) => {
                          if (!canExpand) return;
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setExpanded(isOpen ? null : key);
                          }
                        }}
                      >
                        <td className="px-4 py-[10px] font-medium text-[#0f172a]">{row.typeName}</td>
                        <td className="px-4 py-[10px] text-[12px] font-mono text-[#64748b] hidden md:table-cell max-w-[240px] truncate">
                          {row.pattern ?? <span className="italic font-sans">{t("fqdnFallback")}</span>}
                        </td>
                        <td className="px-4 py-[10px] text-right text-[#64748b] tabular-nums">{row.measured}</td>
                        <td className="px-4 py-[10px] text-right text-[#64748b] tabular-nums">{row.compliant}</td>
                        <td className="px-4 py-[10px] text-right tabular-nums font-medium text-[#dc2626]">{row.nonCompliant || <span className="text-[#64748b] font-normal">0</span>}</td>
                        <td className="px-4 py-[10px] text-right text-[#64748b] tabular-nums hidden sm:table-cell">{row.noHostname}</td>
                        <td className={cn("px-4 py-[10px] text-right tabular-nums font-semibold", rateColor(row.rate))}>
                          {formatRate(row.rate) ?? t("notApplicable")}
                        </td>
                        <td className="px-4 py-[10px] text-right">
                          {canExpand && (isOpen
                            ? <ChevronUp className="h-3.5 w-3.5 text-[#64748b] inline" />
                            : <ChevronDown className="h-3.5 w-3.5 text-[#64748b] inline" />)}
                        </td>
                      </tr>
                      {isOpen && canExpand && (
                        <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                          <td colSpan={8} className="px-6 py-3">
                            <table className="w-full text-[12px]">
                              <thead>
                                <tr className="text-[#64748b]">
                                  <th scope="col" className="text-left font-medium pb-1 pr-4">{t("hostname")}</th>
                                  <th scope="col" className="text-left font-medium pb-1 pr-4">{t("model")}</th>
                                  <th scope="col" className="text-left font-medium pb-1 pr-4">{t("serial")}</th>
                                  <th scope="col" className="text-left font-medium pb-1">{t("location")}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {row.nonCompliantAssets.map((a) => (
                                  <tr key={a.id} className="align-top">
                                    <td className="pr-4 py-0.5 font-mono text-[#dc2626] break-all">{a.hostname}</td>
                                    <td className="pr-4 py-0.5 text-[#334155]">{a.model ?? "—"}</td>
                                    <td className="pr-4 py-0.5 text-[#64748b] font-mono">{a.serialNumber ?? "—"}</td>
                                    <td className="py-0.5 text-[#64748b]">{a.locationPath ?? a.fiNumber ?? "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
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
