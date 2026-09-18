"use client";

import { useState, useEffect } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Loader2, MapPin, Search, ChevronRight } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

type LocationNode = {
  id: string;
  name: string;
  parentId: string | null;
  children?: LocationNode[];
  _count?: { stockItems: number };
};

type FlatLocation = { id: string; name: string; breadcrumb: string; hasStock: boolean };

function flattenLocations(nodes: LocationNode[], ancestors: string[] = []): FlatLocation[] {
  const result: FlatLocation[] = [];
  for (const node of nodes) {
    const path = [...ancestors, node.name];
    result.push({
      id: node.id,
      name: node.name,
      breadcrumb: path.join(" › "),
      hasStock: (node._count?.stockItems ?? 0) > 0,
    });
    if (node.children?.length) result.push(...flattenLocations(node.children, path));
  }
  return result;
}

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
  const [locationQuery, setLocationQuery] = useState("");
  const [showAllLocations, setShowAllLocations] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BulkRelocateResult | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/locations")
      .then((r) => r.json())
      .then((tree: LocationNode[]) => setLocations(flattenLocations(tree)));
  }, [open]);

  function handleClose() {
    onOpenChange(false);
    setLocationQuery("");
    setShowAllLocations(false);
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

  const filteredLocations = locations
    .filter((l) => showAllLocations || l.hasStock || l.id === selectedLocationId)
    .filter((l) => l.breadcrumb.toLowerCase().includes(locationQuery.toLowerCase()));

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
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#94a3b8]" />
                <Input
                  placeholder={t("selectLocation")}
                  value={locationQuery}
                  onChange={(e) => setLocationQuery(e.target.value)}
                  className="pl-8 h-9 text-[13px]"
                />
              </div>
              <label htmlFor="bulkShowAllLocations" className="flex items-center gap-1.5 text-[12px] text-[#64748b] cursor-pointer">
                <Checkbox
                  id="bulkShowAllLocations"
                  checked={showAllLocations}
                  onCheckedChange={(v) => setShowAllLocations(v === true)}
                />
                {t("showAllLocations")}
              </label>
              <div className="border border-[#e2e8f0] rounded-[8px] overflow-y-auto max-h-48">
                <ul className="divide-y divide-[#f1f5f9]">
                  <li>
                    <button
                      type="button"
                      onClick={() => setSelectedLocationId("")}
                      className={cn(
                        "w-full text-left px-3 py-2 text-[12.5px] transition-colors",
                        !selectedLocationId ? "bg-[#e8f0fc] text-[#1e64c8]" : "hover:bg-[#f8fafc] text-[#64748b]"
                      )}
                    >
                      {t("unassigned")}
                    </button>
                  </li>
                  {filteredLocations.map((loc) => {
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
              </div>
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
