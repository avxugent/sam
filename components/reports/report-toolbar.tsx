"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Download, ExternalLink, Pencil, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

/** Summary + edit/export actions + result filter shown above every report table. */
export function ReportToolbar({
  reportId,
  reportName,
  canEdit,
  grafanaUrl,
  summary,
  search,
  onSearchChange,
}: {
  reportId: string;
  reportName: string;
  canEdit: boolean;
  grafanaUrl?: string | null;
  summary: ReactNode;
  search: string;
  onSearchChange: (value: string) => void;
}) {
  const t = useTranslations("report");
  const tCommon = useTranslations("common");
  const { toast } = useToast();

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
    <>
      <div className="flex items-center justify-between flex-wrap gap-3">
        {summary}
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

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t("filterResults")}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 h-[36px] text-[13px] rounded-[8px]"
        />
      </div>
    </>
  );
}
