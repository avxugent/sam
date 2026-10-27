"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { flattenLocations, type LocationTreeNode, type FlatLocation } from "@/lib/location-tree";
import { StockLocationPicker } from "@/components/stock/stock-location-picker";
import { BulkResultSummary, type BulkResult } from "@/components/assets/bulk-result-summary";

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
  const [locations, setLocations] = useState<FlatLocation[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState("");

  useEffect(() => {
    if (!open) return;
    fetch("/api/locations")
      .then((r) => r.json())
      .then((tree: LocationTreeNode[]) => setLocations(flattenLocations(tree)));
  }, [open]);

  function handleClose() {
    onOpenChange(false);
    setResult(null);
    setSelectedLocationId("");
  }

  async function handleSubmit() {
    if (!selectedLocationId) return;
    setSubmitting(true);
    const res = await fetch("/api/assets/bulk-return-to-stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: assetIds, locationId: selectedLocationId }),
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
