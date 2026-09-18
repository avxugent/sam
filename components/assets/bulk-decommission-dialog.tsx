"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { DISPOSAL_METHODS } from "@/components/assets/remove-asset-dialog";

type BulkResult = { succeeded: string[]; failed: { id: string; reason: string }[] };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetIds: string[];
  onComplete: (result: BulkResult) => void;
};

export function BulkDecommissionDialog({ open, onOpenChange, assetIds, onComplete }: Props) {
  const { toast } = useToast();
  const t = useTranslations("decommissioned");
  const tCommon = useTranslations("common");

  const [disposalMethod, setDisposalMethod] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);

  function handleClose() {
    onOpenChange(false);
    setDisposalMethod("");
    setNote("");
    setResult(null);
  }

  async function handleSubmit() {
    if (!disposalMethod) return;
    setSubmitting(true);
    const res = await fetch("/api/assets/bulk-decommission", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: assetIds, disposalMethod, note: note || null }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const err = await res.json();
      toast({ title: tCommon("error"), description: err.error, variant: "destructive" });
      return;
    }

    const data = (await res.json()) as BulkResult;
    onComplete(data);
    if (data.failed.length === 0) {
      handleClose();
    } else {
      setResult(data);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent>
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("bulkDecommissionResultsTitle")}</DialogTitle>
            </DialogHeader>
            <p className="text-[13px] text-[#64748b]">{t("bulkSkippedSummary", { count: result.failed.length })}</p>
            <ul className="text-[12.5px] text-[#64748b] space-y-1 max-h-48 overflow-y-auto">
              {result.failed.map((f) => (
                <li key={f.id} className="flex justify-between gap-2 border-b border-[#f1f5f9] py-1">
                  <span className="font-mono text-[11.5px]">{f.id}</span>
                  <span>{t(`bulkSkipReason.${f.reason}`)}</span>
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button size="sm" onClick={handleClose}>{tCommon("close")}</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("bulkDecommissionTitle", { count: assetIds.length })}</DialogTitle>
              <DialogDescription>{t("decommissionOptionDescription")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="bulk-disposal-method" className="text-[13px]">
                  {t("disposalMethodLabel")} <span aria-hidden="true" className="text-destructive">*</span>
                </Label>
                <select
                  id="bulk-disposal-method"
                  value={disposalMethod}
                  onChange={(e) => setDisposalMethod(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-input bg-transparent text-[13px] focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">{t("disposalMethodPlaceholder")}</option>
                  {DISPOSAL_METHODS.map((m) => (
                    <option key={m} value={m}>{t(`disposalMethod.${m}`)}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="bulk-decommission-note" className="text-[13px]">{t("decommissionReasonLabel")}</Label>
                <Input
                  id="bulk-decommission-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t("decommissionReasonPlaceholder")}
                  maxLength={500}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={handleClose} disabled={submitting}>
                {tCommon("cancel")}
              </Button>
              <Button
                size="sm"
                disabled={submitting || !disposalMethod}
                onClick={handleSubmit}
                className="bg-[#ca8a04] hover:bg-[#a16207] text-white"
              >
                {submitting ? t("decommissioning") : t("decommissionAsset")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
