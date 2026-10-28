"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { StockLocationPicker } from "@/components/inventory/stock-location-picker";
import { BulkResultSummary, type BulkResult } from "@/components/inventory/bulk-result-summary";
import { useLocationOptions } from "@/components/inventory/use-location-options";
import { apiErrorMessage } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemIds: string[];
  onComplete: (result: BulkResult) => void;
};

export function BulkRelocateDialog({ open, onOpenChange, itemIds, onComplete }: Props) {
  const t = useTranslations("stock");
  const tCommon = useTranslations("common");
  const { toast } = useToast();

  const { locations } = useLocationOptions(open);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);

  function handleClose() {
    onOpenChange(false);
    setSelectedLocationId("");
    setResult(null);
  }

  async function handleSubmit() {
    setSubmitting(true);
    const res = await fetch("/api/stock/bulk-relocate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: itemIds, locationId: selectedLocationId || null }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ title: tCommon("error"), description: apiErrorMessage(err), variant: "destructive" });
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
      <DialogContent className="max-w-md">
        {result ? (
          <BulkResultSummary
            title={t("bulkRelocateResultsTitle")}
            summary={t("bulkRelocateSkipped", { count: result.failed.length })}
            failed={result.failed}
            reasonLabel={(reason) => reason}
            onClose={handleClose}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("bulkRelocateTitle", { count: itemIds.length })}</DialogTitle>
            </DialogHeader>
            <p className="text-[12.5px] text-[#64748b]">{t("bulkRelocateDescription")}</p>

            <div className="space-y-1">
              <StockLocationPicker
                locations={locations}
                selectedId={selectedLocationId}
                onSelect={setSelectedLocationId}
                placeholder={t("selectLocation")}
                showAllLabel={t("showAllLocations")}
                unassignedLabel={t("unassigned")}
                idPrefix="bulk-relocate"
                listClassName="max-h-48"
              />
            </div>

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
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                {t("bulkRelocateConfirm")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
