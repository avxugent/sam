"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Download, Loader2, Save, Calendar } from "lucide-react";
import { apiErrorMessage, toIsoDay } from "@/lib/utils";
import { apiFetch, downloadFile, jsonBody } from "@/lib/api-client";

export function ExportClient({
  initialCronExpression,
  initialOutputDir,
  initialEnabled,
}: {
  initialCronExpression: string;
  initialOutputDir: string;
  initialEnabled: boolean;
}) {
  const t = useTranslations("export");
  const tCommon = useTranslations("common");
  const { toast } = useToast();
  const [cronExpression, setCronExpression] = useState(initialCronExpression);
  const [outputDir, setOutputDir] = useState(initialOutputDir);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState<null | "active" | "decommissioned" | "stock">(null);

  async function download(endpoint: string, prefix: string, kind: "active" | "decommissioned" | "stock") {
    setDownloading(kind);
    const ok = await downloadFile(endpoint, `${prefix}-${toIsoDay(new Date())}.csv`);
    setDownloading(null);
    toast(ok ? { title: t("exportComplete") } : { title: tCommon("error"), variant: "destructive" });
  }

  async function handleSave() {
    setSaving(true);
    const res = await apiFetch("/api/settings/export", jsonBody("PUT", { cronExpression, outputDir, enabled }));
    setSaving(false);
    if (!res.ok) {
      toast({ title: tCommon("error"), description: apiErrorMessage(res.error), variant: "destructive" });
      return;
    }
    toast({ title: t("scheduleSaved") });
  }

  return (
    <div className="space-y-8">
      <section className="bg-card border border-border rounded-[10px] p-6 space-y-4">
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">{t("title")}</h2>
          <p className="text-[13px] text-muted-foreground mt-1">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => download("/api/export/csv", "sam-export", "active")}
            disabled={downloading !== null}
            className="gap-2"
          >
            {downloading === "active" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {t("downloadCsv")}
          </Button>
          <Button
            onClick={() => download("/api/export/decommissioned", "sam-decommissioned", "decommissioned")}
            disabled={downloading !== null}
            variant="outline"
            className="gap-2"
          >
            {downloading === "decommissioned" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {t("downloadDecommissioned")}
          </Button>
          <Button
            onClick={() => download("/api/export/stock", "sam-stock", "stock")}
            disabled={downloading !== null}
            variant="outline"
            className="gap-2"
          >
            {downloading === "stock" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {t("downloadStock")}
          </Button>
        </div>
      </section>

      <section className="bg-card border border-border rounded-[10px] p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-[15px] font-semibold text-foreground">{t("scheduleTitle")}</h2>
        </div>

        <p className="text-[13px] text-muted-foreground">{t("scheduleIntro")}</p>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cron-expression">{t("scheduleCron")}</Label>
            <Input
              id="cron-expression"
              value={cronExpression}
              onChange={(e) => setCronExpression(e.target.value)}
              placeholder="0 2 * * *"
              className="font-mono text-[13px] max-w-xs"
            />
            <p className="text-[12px] text-muted-foreground">{t.rich("scheduleCronExample", { code: (chunks) => <code className="font-mono bg-muted px-1 rounded">{chunks}</code> })}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="output-dir">{t("scheduleOutputDir")}</Label>
            <Input
              id="output-dir"
              value={outputDir}
              onChange={(e) => setOutputDir(e.target.value)}
              placeholder="/backups"
              className="font-mono text-[13px] max-w-xs"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="enabled"
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="enabled" className="cursor-pointer">{t("scheduleShowActive")}</Label>
          </div>
        </div>

        <div className="mt-4 p-4 bg-background border border-border rounded-[8px] space-y-3">
          <p className="text-[12px] font-semibold text-secondary-foreground">{t("setupInstructions")}</p>
          <p className="text-[12px] text-muted-foreground">{t.rich("setupOptionHttp", { code: (chunks) => <code className="font-mono bg-muted px-1 rounded">{chunks}</code> })}</p>
          <pre className="text-[11.5px] font-mono text-secondary-foreground bg-muted p-3 rounded-[6px] overflow-x-auto whitespace-pre-wrap break-all">
{`${cronExpression} curl -s -H "Authorization: Bearer $EXPORT_TOKEN" \\
  http://localhost:3000/api/export/csv \\
  > ${outputDir}/sam-$(date +%Y%m%d).csv`}
          </pre>
          <p className="text-[12px] text-muted-foreground">{t("setupOptionCli")}</p>
          <pre className="text-[11.5px] font-mono text-secondary-foreground bg-muted p-3 rounded-[6px] overflow-x-auto">
{`${cronExpression} cd /app && node --import tsx/esm scripts/export-backup.mjs --output ${outputDir}`}
          </pre>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} variant="outline" className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("saveSchedule")}
          </Button>
        </div>
      </section>
    </div>
  );
}
