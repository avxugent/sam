"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";
import { type FlatLocation } from "@/lib/locations/tree";
import { LocationSearchList } from "@/components/inventory/location-search-list";
import { useLocationOptions } from "@/components/inventory/use-location-options";
import { apiErrorMessage } from "@/lib/utils";

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
  const { locations, loading: loadingLocations } = useLocationOptions(open);
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
  }, [open, isSerialized]);

  useEffect(() => {
    if (open && !loadingLocations) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open, loadingLocations]);

  useEffect(() => {
    setSerialInputs(Array.from({ length: quantity }, (_, i) => serialInputs[i] ?? ""));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quantity]);

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
      const err = await res.json().catch(() => ({}));
      toast({ title: t("deployFailed"), description: apiErrorMessage(err), variant: "destructive" });
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

        <div className="text-[12.5px] text-muted-foreground space-y-0.5">
          {isSerialized && (
            <p>{tStock("serial")}: <span className="font-mono text-foreground">{itemSerial}</span></p>
          )}
          {!isSerialized && (
            <p>{t("available")}: <span className="font-medium text-foreground">{availableQuantity}</span></p>
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
            <Label className="text-[12.5px] text-muted-foreground">{t("serialNumbersOptional")}</Label>
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
        <LocationSearchList
          locations={locations}
          loading={loadingLocations}
          query={query}
          onQueryChange={setQuery}
          selectedId={selected?.id ?? null}
          onSelect={setSelected}
          placeholder={t("searchLocations")}
          emptyText={t("noLocationsFound")}
          inputRef={searchRef}
          listClassName="max-h-52"
        />

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
