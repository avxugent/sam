"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { StockLocationPicker } from "@/components/inventory/stock-location-picker";
import { BulkResultSummary, type BulkResult } from "@/components/inventory/bulk-result-summary";
import { useLocationOptions } from "@/components/inventory/use-location-options";
import { apiErrorMessage } from "@/lib/utils";
import { apiFetch, jsonBody } from "@/lib/api-client";

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
  const { locations } = useLocationOptions(open);
  const [selectedLocationId, setSelectedLocationId] = useState("");

  function handleClose() {
    onOpenChange(false);
    setResult(null);
    setSelectedLocationId("");
  }

  async function handleSubmit() {
    if (!selectedLocationId) return;
    setSubmitting(true);
    const res = await apiFetch<BulkResult>("/api/assets/bulk-return-to-stock", jsonBody("POST", { ids: assetIds, locationId: selectedLocationId }));
    setSubmitting(false);

    if (!res.ok) {
      toast({ title: tCommon("error"), description: apiErrorMessage(res.error), variant: "destructive" });
      return;
    }

    const data = res.data;
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
          <BulkResultSummary
            title={t("bulkReturnToStockResultsTitle")}
            summary={tDecom("bulkSkippedSummary", { count: result.failed.length })}
            failed={result.failed}
            reasonLabel={(reason) => tDecom(`bulkSkipReason.${reason}`)}
            onClose={handleClose}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("bulkReturnToStockConfirmTitle", { count: assetIds.length })}</DialogTitle>
              <DialogDescription>{t("bulkReturnToStockConfirmDescription")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-1">
              <Label htmlFor="bulk-return-location-search" className="text-[13px]">
                {t("returnToStockLocationLabel")} <span aria-hidden="true" className="text-destructive">*</span>
              </Label>
              <StockLocationPicker
                locations={locations}
                selectedId={selectedLocationId}
                onSelect={setSelectedLocationId}
                placeholder={t("searchLocations")}
                showAllLabel={t("showAllLocations")}
                emptyText={t("noLocationsFound")}
                idPrefix="bulk-return"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={handleClose} disabled={submitting}>
                {tCommon("cancel")}
              </Button>
              <Button
                size="sm"
                disabled={submitting || !selectedLocationId}
                onClick={handleSubmit}
                className="bg-primary hover:bg-primary-hover text-white"
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
