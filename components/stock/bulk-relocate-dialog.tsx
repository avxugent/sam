"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { StockLocationPicker } from "@/components/inventory/stock-location-picker";
import { BulkActionDialog } from "@/components/inventory/bulk-action-dialog";
import type { BulkResult } from "@/lib/bulk";
import { useLocationOptions } from "@/components/inventory/use-location-options";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemIds: string[];
  onComplete: (result: BulkResult) => void;
};

export function BulkRelocateDialog({ open, onOpenChange, itemIds, onComplete }: Props) {
  const t = useTranslations("stock");
  const tDecom = useTranslations("decommissioned");

  const { locations } = useLocationOptions(open);
  const [selectedLocationId, setSelectedLocationId] = useState("");

  return (
    <BulkActionDialog
      open={open}
      onOpenChange={onOpenChange}
      onComplete={onComplete}
      url="/api/stock/bulk-relocate"
      body={() => ({ ids: itemIds, locationId: selectedLocationId || null })}
      onReset={() => setSelectedLocationId("")}
      title={t("bulkRelocateTitle", { count: itemIds.length })}
      description={t("bulkRelocateDescription")}
      contentClassName="max-w-md"
      resultTitle={t("bulkRelocateResultsTitle")}
      resultSummary={(count) => t("bulkRelocateSkipped", { count })}
      reasonLabel={(reason) => tDecom(`bulkSkipReason.${reason}`)}
      confirmLabel={(submitting) => (
        <>
          {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
          {t("bulkRelocateConfirm")}
        </>
      )}
      confirmClassName="bg-primary hover:bg-primary-hover text-white"
    >
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
    </BulkActionDialog>
  );
}
