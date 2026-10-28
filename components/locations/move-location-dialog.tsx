"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";
import { flattenLocations, collectSubtreeIds, type FlatLocation } from "@/lib/locations/tree";
import { LocationSearchList } from "@/components/inventory/location-search-list";
import { useLocationOptions } from "@/components/inventory/use-location-options";
import { apiErrorMessage } from "@/lib/utils";
import { apiFetch } from "@/lib/api-client";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationId: string;
  locationName: string;
  currentParentId: string | null;
  assetCount: number;
};

export function MoveLocationDialog({
  open,
  onOpenChange,
  locationId,
  locationName,
  currentParentId,
  assetCount,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("location");
  const tCommon = useTranslations("common");
  const { locations, loading } = useLocationOptions(open, (tree) =>
    flattenLocations(tree, {
      prune: collectSubtreeIds(tree, locationId),
      hide: new Set<string>(currentParentId ? [currentParentId] : []),
    })
  );
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<FlatLocation | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(null);
    setConfirmOpen(false);
  }, [open]);

  useEffect(() => {
    if (open && !loading) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open, loading]);

  async function doMove() {
    if (!selected) return;
    setSaving(true);
    const res = await apiFetch(`/api/locations/${locationId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId: selected.id }),
    });
    setSaving(false);

    if (!res.ok) {
      toast({ title: tCommon("error"), description: apiErrorMessage(res.error), variant: "destructive" });
      return;
    }

    toast({ title: t("locationMoved", { name: selected.name }) });
    setConfirmOpen(false);
    onOpenChange(false);
    router.refresh();
  }

  function handleMoveClick() {
    if (!selected) return;
    if (assetCount > 0) {
      setConfirmOpen(true);
    } else {
      void doMove();
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("moveTitle", { name: locationName })}</DialogTitle>
          </DialogHeader>

          <LocationSearchList
            locations={locations}
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
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
              {tCommon("cancel")}
            </Button>
            <Button
              size="sm"
              onClick={handleMoveClick}
              disabled={!selected || saving}
              className="bg-primary hover:bg-primary-hover text-white"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              {t("moveToLocationButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("moveConfirmTitle", { name: locationName })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("moveConfirmAssets", { count: assetCount })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void doMove();
              }}
              disabled={saving}
              className="bg-primary hover:bg-primary-hover text-white"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              {t("moveWithAssets")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
