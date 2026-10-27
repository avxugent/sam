"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { flattenLocations, type LocationTreeNode, type FlatLocation } from "@/lib/location-tree";
import { StockLocationPicker } from "@/components/stock/stock-location-picker";

type BulkRelocateResult = {
  succeeded: string[];
  failed: { id: string; reason: string }[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemIds: string[];
  onComplete: (result: BulkRelocateResult) => void;
};

export function BulkRelocateDialog({ open, onOpenChange, itemIds, onComplete }: Props) {
  const t = useTranslations("stock");
  const tCommon = useTranslations("common");
  const { toast } = useToast();

  const [locations, setLocations] = useState<FlatLocation[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BulkRelocateResult | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/locations")
      .then((r) => r.json())
      .then((tree: LocationTreeNode[]) => setLocations(flattenLocations(tree)));
  }, [open]);

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
      const err = await res.json();
      toast({ title: tCommon("error"), description: err.error, variant: "destructive" });
      return;
    }

    const data = (await res.json()) as BulkRelocateResult;
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
          <>
            <DialogHeader>
              <DialogTitle>{t("bulkRelocateResultsTitle")}</DialogTitle>
            </DialogHeader>
            <p className="text-[13px] text-[#64748b]">{t("bulkRelocateSkipped", { count: result.failed.length })}</p>
            <ul className="text-[12.5px] text-[#64748b] space-y-1 max-h-48 overflow-y-auto">
              {result.failed.map((f) => (
                <li key={f.id} className="flex justify-between gap-2 border-b border-[#f1f5f9] py-1">
                  <span className="font-mono text-[11.5px]">{f.id}</span>
                  <span>{f.reason}</span>
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
