"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";
import { apiFetch } from "@/lib/api-client";

type DrilldownAsset = {
  id: string;
  model?: { name: string } | null;
  serialNumber?: string | null;
  hostname?: string | null;
  installationDate?: string | null;
  location: { id: string; name: string } | null;
  manufacturer?: { name: string } | null;
  type?: { name: string } | null;
};

/**
 * Lists the active assets behind a catalog entry (asset type or manufacturer).
 * Fetches `source.url` whenever a source is set; `null` closes the dialog.
 */
export function AssetDrilldownDialog({
  source,
  column,
  onClose,
}: {
  source: { name: string; url: string } | null;
  /** The catalog dimension not implied by the source: show manufacturer for a type, type for a manufacturer. */
  column: "manufacturer" | "type";
  onClose: () => void;
}) {
  const tField = useTranslations("field");
  const tAsset = useTranslations("asset");
  const [assets, setAssets] = useState<DrilldownAsset[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!source) return;
    let stale = false;
    setAssets([]);
    setLoading(true);
    apiFetch<DrilldownAsset[]>(source.url).then((res) => {
      if (stale) return;
      setAssets(res.ok ? res.data : []);
      setLoading(false);
    });
    return () => {
      stale = true;
    };
  }, [source]);

  const headers = [tField("location"), tField(column), tField("model"), tField("serialNumber"), tField("hostname"), tField("installed")];

  return (
    <Dialog open={!!source} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {source?.name}
            {!loading && (
              <span className="font-normal text-muted-foreground ml-2">— {tAsset("assetCount", { count: assets.length })}</span>
            )}
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="overflow-auto max-h-[60vh]">
            <table className="w-full text-sm">
              <caption className="sr-only">{tAsset("drilldownCaption", { name: source?.name ?? "" })}</caption>
              <thead>
                <tr className="border-b bg-muted/50">
                  {headers.map((h) => (
                    <th key={h} scope="col" className="text-left px-3 py-2 font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assets.length === 0 ? (
                  <tr>
                    <td colSpan={headers.length} className="text-center py-8 text-muted-foreground">{tAsset("noAssetsFound")}</td>
                  </tr>
                ) : (
                  assets.map((asset, i) => (
                    <tr key={asset.id} className={`border-b last:border-0 hover:bg-muted/30 ${i % 2 !== 0 ? "bg-muted/10" : ""}`}>
                      <td className="px-3 py-2">
                        {asset.location ? (
                          <Link href={`/locations/${asset.location.id}`} className="hover:text-primary">
                            {asset.location.name}
                          </Link>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {column === "type"
                          ? asset.type ? <Badge variant="outline" className="text-xs">{asset.type.name}</Badge> : "—"
                          : asset.manufacturer?.name || "—"}
                      </td>
                      <td className="px-3 py-2 font-medium">{asset.model?.name || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{asset.serialNumber || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{asset.hostname || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">{formatDate(asset.installationDate)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
