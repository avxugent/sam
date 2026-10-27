"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { MapPin, Search, Loader2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { flattenLocations, type LocationTreeNode, type FlatLocation } from "@/lib/location-tree";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  itemModel: string;
  itemSerial: string | null;
  availableQuantity: number;
};

export function DeployStockDialog({
  open,
  onOpenChange,
  itemId,
  itemModel,
  itemSerial,
  availableQuantity,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("deploy");
  const tCommon = useTranslations("common");
  const tStock = useTranslations("stock");
  const [locations, setLocations] = useState<FlatLocation[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<FlatLocation | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [serialInputs, setSerialInputs] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [isPending, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);

  const isSerialized = !!itemSerial;
  const showSerialInputs = !isSerialized && quantity > 1;

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(null);
    setQuantity(isSerialized ? 1 : 1);
    setSerialInputs([]);
    setLoadingLocations(true);
    fetch("/api/locations")
      .then((r) => r.json())
      .then((tree: LocationTreeNode[]) => setLocations(flattenLocations(tree)))
      .catch(() => toast({ title: tCommon("loadLocationsFailed"), variant: "destructive" }))
      .finally(() => setLoadingLocations(false));
  }, [open, isSerialized, toast]);

  useEffect(() => {
    if (open && !loadingLocations) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open, loadingLocations]);

  useEffect(() => {
    setSerialInputs(Array.from({ length: quantity }, (_, i) => serialInputs[i] ?? ""));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quantity]);

  const filtered = locations.filter((l) =>
    l.breadcrumb.toLowerCase().includes(query.toLowerCase())
  );

  async function handleDeploy() {
    if (!selected) return;
    setSaving(true);

    const body: Record<string, unknown> = { locationId: selected.id, quantity };
    if (isSerialized) {
      body.serialNumbers = [itemSerial];
    } else if (serialInputs.some((s) => s.trim())) {
      body.serialNumbers = serialInputs.map((s) => s.trim());
    }

    const res = await fetch(`/api/stock/${itemId}/deploy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);

    if (!res.ok) {
      const err = await res.json();
      toast({ title: t("deployFailed"), description: err.error, variant: "destructive" });
      return;
    }

    toast({ title: t("deployedToLocation", { qty: quantity, model: itemModel, location: selected.name }) });
    onOpenChange(false);
    startTransition(() => {
      router.push(`/locations/${selected.id}`);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title", { model: itemModel })}</DialogTitle>
        </DialogHeader>

        <div className="text-[12.5px] text-[#64748b] space-y-0.5">
          {isSerialized && (
            <p>{tStock("serial")}: <span className="font-mono text-[#0f172a]">{itemSerial}</span></p>
          )}
          {!isSerialized && (
            <p>{t("available")}: <span className="font-medium text-[#0f172a]">{availableQuantity}</span></p>
          )}
        </div>

        {/* Quantity selector (only for bulk items) */}
        {!isSerialized && (
          <div className="space-y-1">
            <Label htmlFor="deploy-qty">{t("quantityToDeploy")}</Label>
            <Input
              id="deploy-qty"
              type="number"
              min={1}
              max={availableQuantity}
              value={quantity}
              onChange={(e) => setQuantity(Math.min(availableQuantity, Math.max(1, parseInt(e.target.value) || 1)))}
              className="w-24 h-9"
            />
          </div>
        )}

        {/* Optional serial numbers for bulk deploy */}
        {showSerialInputs && (
          <div className="space-y-2">
            <Label className="text-[12.5px] text-[#64748b]">{t("serialNumbersOptional")}</Label>
            <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
              {serialInputs.map((s, i) => (
                <Input
                  key={i}
                  value={s}
                  onChange={(e) => {
                    const next = [...serialInputs];
                    next[i] = e.target.value;
                    setSerialInputs(next);
                  }}
                  placeholder={t("unitSerial", { n: i + 1 })}
                  className="font-mono text-[12.5px] h-8"
                />
              ))}
            </div>
          </div>
        )}

        {/* Location picker */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#94a3b8]" />
          <Input
            ref={searchRef}
            placeholder={t("searchLocations")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 h-9 text-[13px]"
          />
        </div>

        <div className="border border-[#e2e8f0] rounded-[8px] overflow-y-auto max-h-52 min-h-[80px]">
          {loadingLocations ? (
            <div className="flex items-center justify-center h-20 text-[#64748b]">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-20 text-[13px] text-[#94a3b8]">
              {t("noLocationsFound")}
            </div>
          ) : (
            <ul className="divide-y divide-[#f1f5f9]">
              {filtered.map((loc) => {
                const parts = loc.breadcrumb.split(" › ");
                const isSelected = selected?.id === loc.id;
                return (
                  <li key={loc.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(loc)}
                      className={cn(
                        "w-full text-left px-3 py-2.5 flex items-center gap-2 transition-colors",
                        isSelected
                          ? "bg-[#e8f0fc] text-[#1e64c8]"
                          : "hover:bg-[#f8fafc] text-[#0f172a]"
                      )}
                    >
                      <MapPin className={cn("h-3.5 w-3.5 flex-shrink-0", isSelected ? "text-[#1e64c8]" : "text-[#94a3b8]")} />
                      <span className="flex items-center gap-1 text-[12.5px] flex-wrap">
                        {parts.map((part, i) => (
                          <span key={i} className="flex items-center gap-1">
                            {i > 0 && <ChevronRight className="h-3 w-3 opacity-40" />}
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

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving || isPending}>
            {tCommon("cancel")}
          </Button>
          <Button
            size="sm"
            onClick={handleDeploy}
            disabled={!selected || saving || isPending}
            className="bg-[#1e64c8] hover:bg-[#1a56b0] text-white"
          >
            {saving || isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            {tStock("deployTo")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
