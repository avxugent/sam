"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Download, Loader2, Save, Calendar } from "lucide-react";

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
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await fetch("/api/export/csv");
      if (!res.ok) {
        toast({ title: tCommon("error"), variant: "destructive" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `sam-export-${date}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: t("exportComplete") });
    } finally {
      setDownloading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    const res = await fetch("/api/settings/export", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cronExpression, outputDir, enabled }),
    });
    setSaving(false);
    if (!res.ok) {
      toast({ title: tCommon("error"), variant: "destructive" });
      return;
    }
    toast({ title: "Schedule settings saved" });
  }

  return (
    <div className="space-y-8">
      {/* Manual export */}
      <section className="bg-white border border-[#e2e8f0] rounded-[10px] p-6 space-y-4">
        <div>
          <h2 className="text-[15px] font-semibold text-[#0f172a]">{t("title")}</h2>
          <p className="text-[13px] text-[#64748b] mt-1">{t("subtitle")}</p>
        </div>
        <Button onClick={handleDownload} disabled={downloading} className="gap-2">
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {t("downloadCsv")}
        </Button>
      </section>

      {/* Schedule configuration */}
      <section className="bg-white border border-[#e2e8f0] rounded-[10px] p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-[#64748b]" />
          <h2 className="text-[15px] font-semibold text-[#0f172a]">Automated backup schedule</h2>
        </div>

        <p className="text-[13px] text-[#64748b]">
          SAM does not run a built-in scheduler. Configure an external cron job or Docker cron container
          to call the export endpoint on a schedule.
        </p>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cron-expression">Schedule (cron expression)</Label>
            <Input
              id="cron-expression"
              value={cronExpression}
              onChange={(e) => setCronExpression(e.target.value)}
              placeholder="0 2 * * *"
              className="font-mono text-[13px] max-w-xs"
            />
            <p className="text-[12px] text-[#64748b]">
              Example: <code className="font-mono bg-[#f1f5f9] px-1 rounded">0 2 * * *</code> = every night at 02:00
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="output-dir">Output directory (on the server)</Label>
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
            <Label htmlFor="enabled" className="cursor-pointer">Show schedule as active in documentation</Label>
          </div>
        </div>

        {/* Setup instructions */}
        <div className="mt-4 p-4 bg-[#f8fafc] border border-[#e2e8f0] rounded-[8px] space-y-3">
          <p className="text-[12px] font-semibold text-[#334155]">Setup instructions</p>
          <p className="text-[12px] text-[#64748b]">
            Option 1 — HTTP via cron (set <code className="font-mono bg-[#f1f5f9] px-1 rounded">EXPORT_TOKEN</code> in your .env):
          </p>
          <pre className="text-[11.5px] font-mono text-[#334155] bg-[#f1f5f9] p-3 rounded-[6px] overflow-x-auto whitespace-pre-wrap break-all">
{`${cronExpression} curl -s -H "Authorization: Bearer $EXPORT_TOKEN" \\
  http://localhost:3000/api/export/csv \\
  > ${outputDir}/sam-$(date +%Y%m%d).csv`}
          </pre>
          <p className="text-[12px] text-[#64748b]">Option 2 — CLI script (runs directly against the database):</p>
          <pre className="text-[11.5px] font-mono text-[#334155] bg-[#f1f5f9] p-3 rounded-[6px] overflow-x-auto">
{`${cronExpression} cd /app && node scripts/export-backup.mjs --output ${outputDir}`}
          </pre>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} variant="outline" className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save schedule settings
          </Button>
        </div>
      </section>
    </div>
  );
}
