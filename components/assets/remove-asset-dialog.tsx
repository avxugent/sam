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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Package, ArchiveX, Trash2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const DISPOSAL_METHODS = ["WIPED", "DESTROYED", "RETURNED", "RESOLD", "OTHER"] as const;

type RemoveAction = "stock" | "decommission" | "delete";
type Step = "choose" | RemoveAction;

type Props = {
  assetId: string;
  assetName: string;
  children: React.ReactNode;
  /** Called after a successful move-to-stock, decommission, or delete. */
  onRemoved?: (action: RemoveAction) => void;
};

function OptionRow({
  icon,
  title,
  description,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-start gap-3 rounded-[8px] border p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        danger ? "border-[#fecaca]" : "border-[#e2e8f0]"
      )}
    >
      <div
        className={cn(
          "h-8 w-8 rounded-[7px] flex items-center justify-center flex-shrink-0",
          danger ? "bg-red-50" : "bg-[#f1f5f9]"
        )}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-[#0f172a]">{title}</p>
        <p className="text-[12px] text-muted-foreground">{description}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
    </button>
  );
}

export function RemoveAssetDialog({ assetId, assetName, children, onRemoved }: Props) {
  const { toast } = useToast();
  const t = useTranslations("asset");
  const tCommon = useTranslations("common");
  const tDecom = useTranslations("decommissioned");

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("choose");
  const [submitting, setSubmitting] = useState(false);
  const [disposalMethod, setDisposalMethod] = useState("");
  const [decommissionNote, setDecommissionNote] = useState("");

  function reset() {
    setStep("choose");
    setSubmitting(false);
    setDisposalMethod("");
    setDecommissionNote("");
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  function finish(action: RemoveAction) {
    setOpen(false);
    reset();
    onRemoved?.(action);
  }

  async function handleStock() {
    setSubmitting(true);
    const res = await fetch(`/api/assets/${assetId}/return-to-stock`, { method: "POST" });
    setSubmitting(false);
    if (!res.ok) {
      const err = await res.json();
      toast({ title: tCommon("error"), description: err.error, variant: "destructive" });
      return;
    }
    toast({ title: t("returnedToStock") });
    finish("stock");
  }

  async function handleDecommission() {
    if (!disposalMethod) return;
    setSubmitting(true);
    const res = await fetch(`/api/assets/${assetId}/decommission`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: decommissionNote || null, disposalMethod }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const err = await res.json();
      toast({ title: tCommon("error"), description: err.error, variant: "destructive" });
      return;
    }
    toast({ title: tDecom("decommissionAsset") });
    finish("decommission");
  }

  async function handleDelete() {
    setSubmitting(true);
    const res = await fetch(`/api/assets/${assetId}`, { method: "DELETE" });
    setSubmitting(false);
    if (!res.ok) {
      const err = await res.json();
      toast({ title: tCommon("error"), description: err.error, variant: "destructive" });
      return;
    }
    toast({ title: t("assetDeleted") });
    finish("delete");
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        {step === "choose" && (
          <>
            <DialogHeader>
              <DialogTitle>{t("removeChooseTitle", { name: assetName })}</DialogTitle>
              <DialogDescription>{t("removeChooseDescription")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <OptionRow
                icon={<Package className="h-4 w-4 text-[#1e64c8]" />}
                title={t("returnToStock")}
                description={t("returnToStockOptionDescription")}
                onClick={() => setStep("stock")}
              />
              <OptionRow
                icon={<ArchiveX className="h-4 w-4 text-[#92400e]" />}
                title={tDecom("decommissionAsset")}
                description={tDecom("decommissionOptionDescription")}
                onClick={() => setStep("decommission")}
              />
              <OptionRow
                icon={<Trash2 className="h-4 w-4 text-[#ef4444]" />}
                title={tCommon("delete")}
                description={t("deleteOptionDescription")}
                onClick={() => setStep("delete")}
                danger
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                {tCommon("cancel")}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "stock" && (
          <>
            <DialogHeader>
              <DialogTitle>{t("returnToStockConfirmTitle", { name: assetName })}</DialogTitle>
              <DialogDescription>{t("returnToStockConfirmDescription")}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("choose")}>
                {tCommon("back")}
              </Button>
              <Button onClick={handleStock} disabled={submitting} className="bg-[#1e64c8] hover:bg-[#1a56b0] text-white">
                {submitting ? t("returningToStock") : t("returnToStock")}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "decommission" && (
          <>
            <DialogHeader>
              <DialogTitle>{tDecom("decommissionConfirmTitle", { name: assetName })}</DialogTitle>
              <DialogDescription>{tDecom("decommissionConfirmDescription")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="ra-disposal-method" className="text-[13px]">
                  {tDecom("disposalMethodLabel")} <span aria-hidden="true" className="text-destructive">*</span>
                </Label>
                <select
                  id="ra-disposal-method"
                  value={disposalMethod}
                  onChange={(e) => setDisposalMethod(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-input bg-transparent text-[13px] focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">{tDecom("disposalMethodPlaceholder")}</option>
                  {DISPOSAL_METHODS.map((m) => (
                    <option key={m} value={m}>{tDecom(`disposalMethod.${m}`)}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="ra-decommission-note" className="text-[13px]">{tDecom("decommissionReasonLabel")}</Label>
                <Input
                  id="ra-decommission-note"
                  value={decommissionNote}
                  onChange={(e) => setDecommissionNote(e.target.value)}
                  placeholder={tDecom("decommissionReasonPlaceholder")}
                  maxLength={500}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("choose")}>
                {tCommon("back")}
              </Button>
              <Button
                onClick={handleDecommission}
                disabled={submitting || !disposalMethod}
                className="bg-[#ca8a04] hover:bg-[#a16207] text-white"
              >
                {submitting ? tDecom("decommissioning") : tDecom("decommissionAsset")}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "delete" && (
          <>
            <DialogHeader>
              <DialogTitle>{t("deleteConfirmTitle", { name: assetName })}</DialogTitle>
              <DialogDescription>{t("deleteConfirmDescription")}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("choose")}>
                {tCommon("back")}
              </Button>
              <Button
                onClick={handleDelete}
                disabled={submitting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {submitting ? tCommon("deleting") : tCommon("delete")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
