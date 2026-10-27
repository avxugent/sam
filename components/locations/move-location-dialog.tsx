"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { MapPin, Search, Loader2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { flattenLocations, type LocationTreeNode, collectSubtreeIds, type FlatLocation } from "@/lib/location-tree";

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
  const [locations, setLocations] = useState<FlatLocation[]>([]);
  const [loading, setLoading] = useState(false);
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
    setLoading(true);
    fetch("/api/locations")
      .then((r) => r.json())
      .then((tree: LocationTreeNode[]) => {
        const pruneIds = collectSubtreeIds(tree, locationId);
        const hideIds = new Set<string>(currentParentId ? [currentParentId] : []);
        setLocations(flattenLocations(tree, { prune: pruneIds, hide: hideIds }));
      })
      .catch(() => toast({ title: tCommon("error"), variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [open, locationId, currentParentId, toast, tCommon]);

  useEffect(() => {
    if (open && !loading) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open, loading]);

  const filtered = locations.filter((l) =>
    l.breadcrumb.toLowerCase().includes(query.toLowerCase())
  );

  async function doMove() {
    if (!selected) return;
    setSaving(true);
    const res = await fetch(`/api/locations/${locationId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId: selected.id }),
    });
    setSaving(false);

    if (!res.ok) {
      const err = await res.json();
      toast({ title: tCommon("error"), description: err.error, variant: "destructive" });
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

          <div className="border border-[#e2e8f0] rounded-[8px] overflow-y-auto max-h-64 min-h-[80px]">
            {loading ? (
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
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
              {tCommon("cancel")}
            </Button>
            <Button
              size="sm"
              onClick={handleMoveClick}
              disabled={!selected || saving}
              className="bg-[#1e64c8] hover:bg-[#1a56b0] text-white"
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
              className="bg-[#1e64c8] hover:bg-[#1a56b0] text-white"
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
