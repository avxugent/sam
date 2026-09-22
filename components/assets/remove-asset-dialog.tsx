"use client";

import { useState, useEffect } from "react";
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
import { Package, ArchiveX, Trash2, ChevronRight, MapPin, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export const DISPOSAL_METHODS = ["WIPED", "DESTROYED", "RETURNED", "RESOLD", "OTHER"] as const;

type RemoveAction = "stock" | "decommission" | "delete";
type Step = "choose" | RemoveAction;

type LocationNode = {
  id: string;
  name: string;
  parentId: string | null;
  children?: LocationNode[];
};

type FlatLocation = { id: string; name: string; breadcrumb: string };

function flattenLocations(nodes: LocationNode[], ancestors: string[] = []): FlatLocation[] {
  const result: FlatLocation[] = [];
  for (const node of nodes) {
    const path = [...ancestors, node.name];
    result.push({ id: node.id, name: node.name, breadcrumb: path.join(" › ") });
    if (node.children?.length) result.push(...flattenLocations(node.children, path));
  }
  return result;
}

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
  const [locations, setLocations] = useState<FlatLocation[]>([]);
  const [locationQuery, setLocationQuery] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState("");

  function reset() {
    setStep("choose");
    setSubmitting(false);
    setDisposalMethod("");
    setDecommissionNote("");
    setLocationQuery("");
    setSelectedLocationId("");
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  useEffect(() => {
    if (step !== "stock" || locations.length > 0) return;
    fetch("/api/locations")
      .then((r) => r.json())
      .then((tree: LocationNode[]) => setLocations(flattenLocations(tree)));
  }, [step, locations.length]);

  function finish(action: RemoveAction) {
    setOpen(false);
    reset();
    onRemoved?.(action);
  }

  async function handleStock() {
    if (!selectedLocationId) return;
    setSubmitting(true);
    const res = await fetch(`/api/assets/${assetId}/return-to-stock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationId: selectedLocationId }),
    });
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
            <div className="space-y-1">
              <Label htmlFor="ra-location-search" className="text-[13px]">
                {t("returnToStockLocationLabel")} <span aria-hidden="true" className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#94a3b8]" />
                <Input
                  id="ra-location-search"
                  placeholder={t("searchLocations")}
                  value={locationQuery}
                  onChange={(e) => setLocationQuery(e.target.value)}
                  className="pl-8 h-9 text-[13px]"
                />
              </div>
              <div className="border border-[#e2e8f0] rounded-[8px] overflow-y-auto max-h-40">
                {locations.length === 0 ? (
                  <div className="flex items-center justify-center h-16 text-[12.5px] text-[#94a3b8]">
                    {t("noLocationsFound")}
                  </div>
                ) : (
                  <ul className="divide-y divide-[#f1f5f9]">
                    {locations
                      .filter((l) => l.breadcrumb.toLowerCase().includes(locationQuery.toLowerCase()))
                      .map((loc) => {
                        const parts = loc.breadcrumb.split(" › ");
                        const isSelected = selectedLocationId === loc.id;
                        return (
                          <li key={loc.id}>
                            <button
                              type="button"
                              onClick={() => setSelectedLocationId(loc.id)}
                              className={cn(
                                "w-full text-left px-3 py-2 flex items-center gap-1.5 transition-colors",
                                isSelected ? "bg-[#e8f0fc] text-[#1e64c8]" : "hover:bg-[#f8fafc] text-[#0f172a]"
                              )}
                            >
                              <MapPin className={cn("h-3 w-3 flex-shrink-0", isSelected ? "text-[#1e64c8]" : "text-[#94a3b8]")} />
                              <span className="flex items-center gap-1 text-[12.5px] flex-wrap">
                                {parts.map((part, i) => (
                                  <span key={i} className="flex items-center gap-1">
                                    {i > 0 && <ChevronRight className="h-2.5 w-2.5 opacity-40" />}
                                    <span className={i === parts.length - 1 ? "font-medium" : "text-[#64748b]"}>{part}</span>
                                  </span>
                                ))}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                  </ul>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("choose")}>
                {tCommon("back")}
              </Button>
              <Button
                onClick={handleStock}
                disabled={submitting || !selectedLocationId}
                className="bg-[#1e64c8] hover:bg-[#1a56b0] text-white"
              >
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
