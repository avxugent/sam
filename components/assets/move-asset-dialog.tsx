"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { MapPin, Loader2 } from "lucide-react";
import { type FlatLocation } from "@/lib/location-tree";
import { LocationSearchList } from "@/components/inventory/location-search-list";
import { useLocationOptions } from "@/components/inventory/use-location-options";
import { apiErrorMessage } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetId: string;
  assetName: string;
  currentLocationId: string;
  currentLocationName: string;
};

export function MoveAssetDialog({
  open,
  onOpenChange,
  assetId,
  assetName,
  currentLocationId,
  currentLocationName,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("asset");
  const tCommon = useTranslations("common");
  const { locations, loading } = useLocationOptions(open);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<FlatLocation | null>(null);
  const [isPending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(null);
  }, [open]);

  useEffect(() => {
    if (open && !loading) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open, loading]);

  // Moving to the current location would be a no-op.
  const targets = locations.filter((l) => l.id !== currentLocationId);

  async function handleMove() {
    if (!selected) return;
    setSaving(true);
    const res = await fetch(`/api/assets/${assetId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationId: selected.id }),
    });
    setSaving(false);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ title: tCommon("error"), description: apiErrorMessage(err), variant: "destructive" });
      return;
    }

    toast({ title: t("assetMoved", { name: selected.name }) });
    onOpenChange(false);
    startTransition(() => {
      router.push(`/locations/${selected.id}/assets/${assetId}`);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("moveTitle", { name: assetName })}</DialogTitle>
        </DialogHeader>

        <div className="text-[12.5px] text-muted-foreground flex items-center gap-1.5 mb-1">
          <MapPin className="h-3.5 w-3.5" />
          {t("currentLocation")}: <span className="font-medium text-foreground">{currentLocationName}</span>
        </div>

        <LocationSearchList
          locations={targets}
          loading={loading}
          query={query}
          onQueryChange={setQuery}
          selectedId={selected?.id ?? null}
          onSelect={setSelected}
          placeholder={t("searchLocations")}
          emptyText={t("noLocationsFound")}
          inputRef={searchRef}
          listClassName="max-h-64"
        />

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving || isPending}>
            {tCommon("cancel")}
          </Button>
          <Button
            size="sm"
            onClick={handleMove}
            disabled={!selected || saving || isPending}
            className="bg-[#1e64c8] hover:bg-[#1a56b0] text-white"
          >
            {saving || isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            {t("moveToLocation")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
