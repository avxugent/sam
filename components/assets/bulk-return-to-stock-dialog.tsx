"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { StockLocationPicker } from "@/components/inventory/stock-location-picker";
import { BulkActionDialog } from "@/components/inventory/bulk-action-dialog";
import type { BulkResult } from "@/lib/assets/bulk";
import { useLocationOptions } from "@/components/inventory/use-location-options";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetIds: string[];
  onComplete: (result: BulkResult) => void;
};

export function BulkReturnToStockDialog({ open, onOpenChange, assetIds, onComplete }: Props) {
  const t = useTranslations("asset");
  const tDecom = useTranslations("decommissioned");

  const { locations } = useLocationOptions(open);
  const [selectedLocationId, setSelectedLocationId] = useState("");

  return (
    <BulkActionDialog
      open={open}
      onOpenChange={onOpenChange}
      onComplete={onComplete}
      url="/api/assets/bulk-return-to-stock"
      body={() => ({ ids: assetIds, locationId: selectedLocationId })}
      onReset={() => setSelectedLocationId("")}
      title={t("bulkReturnToStockConfirmTitle", { count: assetIds.length })}
      description={t("bulkReturnToStockConfirmDescription")}
      resultTitle={t("bulkReturnToStockResultsTitle")}
      resultSummary={(count) => tDecom("bulkSkippedSummary", { count })}
      confirmLabel={(submitting) => (submitting ? t("returningToStock") : t("returnToStock"))}
      confirmDisabled={!selectedLocationId}
      confirmClassName="bg-primary hover:bg-primary-hover text-white"
    >
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
    </BulkActionDialog>
  );
}
