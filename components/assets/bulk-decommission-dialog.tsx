"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DISPOSAL_METHODS } from "@/components/assets/remove-asset-dialog";
import { BulkActionDialog } from "@/components/inventory/bulk-action-dialog";
import type { BulkResult } from "@/lib/assets/bulk";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetIds: string[];
  onComplete: (result: BulkResult) => void;
};

export function BulkDecommissionDialog({ open, onOpenChange, assetIds, onComplete }: Props) {
  const t = useTranslations("decommissioned");

  const [disposalMethod, setDisposalMethod] = useState("");
  const [note, setNote] = useState("");

  return (
    <BulkActionDialog
      open={open}
      onOpenChange={onOpenChange}
      onComplete={onComplete}
      url="/api/assets/bulk-decommission"
      body={() => ({ ids: assetIds, disposalMethod, note: note || null })}
      onReset={() => {
        setDisposalMethod("");
        setNote("");
      }}
      title={t("bulkDecommissionTitle", { count: assetIds.length })}
      description={t("decommissionOptionDescription")}
      resultTitle={t("bulkDecommissionResultsTitle")}
      resultSummary={(count) => t("bulkSkippedSummary", { count })}
      confirmLabel={(submitting) => (submitting ? t("decommissioning") : t("decommissionAsset"))}
      confirmDisabled={!disposalMethod}
      confirmClassName="bg-[#ca8a04] hover:bg-[#a16207] text-white"
    >
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
    </BulkActionDialog>
  );
}
