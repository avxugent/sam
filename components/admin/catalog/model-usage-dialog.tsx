"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AssetStatus } from "@/generated/prisma/enums";
import { apiFetch } from "@/lib/api-client";
import { useApiErrorToast } from "@/components/ui/use-api-error-toast";

type UsageAsset = { id: string; serialNumber: string | null; hostname: string | null; status: AssetStatus; location: { id: string; name: string } | null };
type UsageStockItem = { id: string; serialNumber: string | null; quantity: number; location: { id: string; name: string } | null };

/**
 * Lists the assets and stock items that use a model.
 * Fetches the usage whenever a model is set; `null` closes the dialog.
 */
export function ModelUsageDialog({
  model,
  onClose,
}: {
  model: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const t = useTranslations("models");
  const tCommon = useTranslations("common");
  const showApiError = useApiErrorToast();
  const [assets, setAssets] = useState<UsageAsset[]>([]);
  const [stockItems, setStockItems] = useState<UsageStockItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!model) return;
    let stale = false;
    setAssets([]);
    setStockItems([]);
    setLoading(true);
    apiFetch<{ assets: UsageAsset[]; stockItems: UsageStockItem[] }>(`/api/models/${model.id}/usage`).then((res) => {
      if (stale) return;
      if (res.ok) {
        setAssets(res.data.assets);
        setStockItems(res.data.stockItems);
      } else {
        showApiError(res.error); // an outage must not look like "unused"
      }
      setLoading(false);
    });
    return () => {
      stale = true;
    };
  }, [model, showApiError]);

  return (
    <Dialog open={!!model} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{model?.name}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div role="status" aria-label={tCommon("loading")} className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
          </div>
        ) : (
          <div className="space-y-4 overflow-auto max-h-[60vh]">
            {assets.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-1">{t("usageAssets", { count: assets.length })}</h3>
                <ul className="text-sm divide-y border rounded">
                  {assets.map((a) => (
                    <li key={a.id} className="px-3 py-1.5 flex justify-between">
                      <span>{a.serialNumber || a.hostname || a.id}</span>
                      <span className="text-muted-foreground">{a.location?.name ?? "—"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {stockItems.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-1">{t("usageStock", { count: stockItems.length })}</h3>
                <ul className="text-sm divide-y border rounded">
                  {stockItems.map((s) => (
                    <li key={s.id} className="px-3 py-1.5 flex justify-between">
                      <span>{s.serialNumber || `×${s.quantity}`}</span>
                      <span className="text-muted-foreground">{s.location?.name ?? "—"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
