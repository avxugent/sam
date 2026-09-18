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
import { useToast } from "@/components/ui/use-toast";

type BulkResult = { succeeded: string[]; failed: { id: string; reason: string }[] };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetIds: string[];
  onComplete: (result: BulkResult) => void;
};

export function BulkReturnToStockDialog({ open, onOpenChange, assetIds, onComplete }: Props) {
  const { toast } = useToast();
  const t = useTranslations("asset");
  const tDecom = useTranslations("decommissioned");
  const tCommon = useTranslations("common");

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);

  function handleClose() {
    onOpenChange(false);
    setResult(null);
  }

  async function handleSubmit() {
    setSubmitting(true);
    const res = await fetch("/api/assets/bulk-return-to-stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: assetIds }),
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
              <DialogTitle>{t("bulkReturnToStockResultsTitle")}</DialogTitle>
            </DialogHeader>
            <p className="text-[13px] text-[#64748b]">{tDecom("bulkSkippedSummary", { count: result.failed.length })}</p>
            <ul className="text-[12.5px] text-[#64748b] space-y-1 max-h-48 overflow-y-auto">
              {result.failed.map((f) => (
                <li key={f.id} className="flex justify-between gap-2 border-b border-[#f1f5f9] py-1">
                  <span className="font-mono text-[11.5px]">{f.id}</span>
                  <span>{tDecom(`bulkSkipReason.${f.reason}`)}</span>
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
              <DialogTitle>{t("bulkReturnToStockConfirmTitle", { count: assetIds.length })}</DialogTitle>
              <DialogDescription>{t("bulkReturnToStockConfirmDescription")}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={handleClose} disabled={submitting}>
                {tCommon("cancel")}
              </Button>
              <Button
                size="sm"
                disabled={submitting}
                onClick={handleSubmit}
                className="bg-[#1e64c8] hover:bg-[#1a56b0] text-white"
              >
                {submitting ? t("returningToStock") : t("returnToStock")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
