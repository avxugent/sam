"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { useTranslations } from "next-intl";
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import { apiErrorMessage } from "@/lib/utils";
import { apiFetch } from "@/lib/api-client";

type PreviewData = {
  totalRows: number;
  columns: string[];
  preview: Record<string, string>[];
};

type ImportResult = {
  ok: boolean;
  created: number;
  skipped: number;
  errors: string[];
};

// Which CSV columns map to which SAM fields
const COLUMN_MAPPING = [
  { csv: "CAMPUS", sam: "Location — Level 1 (Campus)" },
  { csv: "GEBOUW", sam: "Location — Level 2 (Building)" },
  { csv: "LOKAAL", sam: "Location — Level 3 (Room) *required*" },
  { csv: "TYPE", sam: "Asset Type (auto-created)" },
  { csv: "BRAND", sam: "Manufacturer (auto-created)" },
  { csv: "MODEL", sam: "Model" },
  { csv: "SERIAL", sam: "Serial Number" },
  { csv: "MAC", sam: "MAC Address(es)" },
  { csv: "IP_HOSTNAME", sam: "Hostname" },
  { csv: "INSTALL_DATE", sam: "Installation Date" },
  { csv: "Factuurnummer", sam: "Invoice Number" },
  { csv: "Factuurdatum", sam: "Invoice Date" },
  { csv: "FI NUMMER", sam: "FI Number → stored on the room location (CC.BB.FFF.RRR)" },
  { csv: "OWNER", sam: "Owner (matched by user email; unmatched → default owner)" },
  { csv: "CRITICALITY", sam: "Criticality (LOW / MEDIUM / HIGH / CRITICAL)" },
  { csv: "END_OF_SUPPORT", sam: "End-of-support date" },
  { csv: "SUPPLIER", sam: "Supplier (auto-created)" },
  { csv: "GUID", sam: "Custom Field: GUID" },
  { csv: "QUANTITY", sam: "Quantity (ignored when a serial number, hostname, or MAC address is set)" },
  { csv: "DIAGONAL", sam: "Custom Field: Diagonal (inch)" },
  { csv: "WIDTH", sam: "Custom Field: Width (cm)" },
  { csv: "HEIGHT", sam: "Custom Field: Height (cm)" },
  { csv: "MIC_TYPE", sam: "Custom Field: Mic type" },
  { csv: "FREQUENCY", sam: "Custom Field: Frequency" },
  { csv: "ROOM_LOCATION", sam: "Custom Field: Room location" },
  { csv: "INTEGRATOR", sam: "Custom Field: Integrator" },
  { csv: "CONTACTPERSOON", sam: "Custom Field: Contact person" },
];

export function CsvImportClient() {
  const { toast } = useToast();
  const t = useTranslations("import");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [showMapping, setShowMapping] = useState(false);

  async function handleFileChange(f: File | null) {
    if (!f) return;
    setFile(f);
    setResult(null);
    setPreview(null);

    setPreviewLoading(true);
    const fd = new FormData();
    fd.append("file", f);
    const res = await apiFetch<PreviewData>("/api/import/preview", { method: "POST", body: fd });
    setPreviewLoading(false);

    if (!res.ok) {
      toast({ title: t("previewFailed"), description: apiErrorMessage(res.error), variant: "destructive" });
      return;
    }
    setPreview(res.data);
  }

  async function handleImport() {
    if (!file) return;
    setImporting(true);
    setResult(null);

    const fd = new FormData();
    fd.append("file", file);
    const res = await apiFetch<ImportResult>("/api/import", { method: "POST", body: fd });
    setImporting(false);

    if (!res.ok) {
      toast({ title: t("importFailed"), description: apiErrorMessage(res.error), variant: "destructive" });
      return;
    }
    setResult(res.data);
    if (res.data.created > 0) {
      toast({ title: t("assetsCreated", { count: res.data.created }) });
    }
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Step 1: File selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("step1Title")}</CardTitle>
          <CardDescription>{t("step1Description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
          />

          {!file ? (
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFileChange(e.dataTransfer.files?.[0] ?? null);
              }}
            >
              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium">{t("dropZone")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("dropZoneSupports")}</p>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30">
              <FileText className="h-5 w-5 text-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <Button variant="ghost" size="icon" aria-label={t("removeFile")} className="h-8 w-8" onClick={reset}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          className="cursor-pointer select-none"
          onClick={() => setShowMapping((v) => !v)}
        >
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">{t("mappingTitle")}</CardTitle>
              <CardDescription>{t("mappingDescription")}</CardDescription>
            </div>
            {showMapping ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </CardHeader>
        {showMapping && (
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-sm">
              {COLUMN_MAPPING.map(({ csv, sam }) => (
                <div key={csv} className="flex items-start gap-2">
                  <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono flex-shrink-0 mt-0.5">
                    {csv}
                  </code>
                  <span className="text-muted-foreground">→ {sam}</span>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Step 2: Preview */}
      {previewLoading && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            {t("parsingFile")}
          </CardContent>
        </Card>
      )}

      {preview && !result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("previewTitle")}</CardTitle>
            <CardDescription>
              {t("detectedRows", { rows: preview.totalRows, cols: preview.columns.length })}
              {preview.totalRows > 0 && ` ${t("firstRowsShown")}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {t("detectedColumns")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {preview.columns.map((col) => {
                  const known = COLUMN_MAPPING.some((m) => m.csv === col);
                  return (
                    <Badge key={col} variant={known ? "default" : "outline"} className="text-xs font-mono">
                      {col}
                    </Badge>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                <span className="inline-block w-3 h-3 rounded bg-primary mr-1 align-middle" />
                {t("recognised")} &nbsp;
                <span className="inline-block w-3 h-3 rounded border border-border mr-1 align-middle" />
                {t("unknownColumn")}
              </p>
            </div>

            {preview.preview.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border rounded-lg overflow-hidden">
                  <caption className="sr-only">{t("previewRowCount", { n: preview.preview.length })}</caption>
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      {preview.columns.map((col) => (
                        <th key={col} scope="col" className="px-2 py-1.5 text-left font-mono font-medium whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.preview.map((row, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                        {preview.columns.map((col) => (
                          <td key={col} className="px-2 py-1.5 max-w-[160px] truncate text-muted-foreground">
                            {row[col] || <span className="opacity-30">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button onClick={handleImport} disabled={importing} size="lg">
                {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("importRows", { count: preview.totalRows })}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Result */}
      {result && (
        <Card className={result.errors.length > 0 && result.created === 0 ? "border-destructive" : "border-green-500"}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {result.created > 0 ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-destructive" />
              )}
              {result.created > 0 ? t("completeTitle") : t("issuesTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-green-700">{result.created}</p>
                <p className="text-green-600 text-xs mt-1">{t("assetsCreatedCount")}</p>
              </div>
              <div className="bg-muted rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-muted-foreground">{result.skipped}</p>
                <p className="text-muted-foreground text-xs mt-1">{t("rowsSkipped")}</p>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div>
                <button
                  className="flex items-center gap-1.5 text-sm font-medium text-destructive hover:underline"
                  onClick={() => setShowErrors((v) => !v)}
                >
                  <AlertCircle className="h-4 w-4" />
                  {t("errorsCount", { count: result.errors.length })}
                  {showErrors ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
                {showErrors && (
                  <ul className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                    {result.errors.map((e, i) => (
                      <li key={i} className="text-xs text-destructive bg-destructive/5 rounded px-2 py-1">
                        {e}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={reset}>
                {t("importAnother")}
              </Button>
              <Button asChild>
                <Link href="/">{t("goToLocations")}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
