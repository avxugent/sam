"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AssetFormDialog } from "@/components/assets/asset-form-dialog";
import { useToast } from "@/components/ui/use-toast";
import { formatDate } from "@/lib/utils";
import { Edit, Trash2, Search, Package, ExternalLink } from "lucide-react";

type Asset = {
  id: string;
  model?: string | null;
  serialNumber?: string | null;
  hostname?: string | null;
  installationDate?: Date | string | null;
  type?: { id: string; name: string } | null;
  manufacturer?: { id: string; name: string } | null;
  macAddresses: { id: string; address: string }[];
  _count: { attachments: number };
  location?: { id: string; name: string };
};

export function AssetTable({
  assets: initialAssets,
  locationId,
  userRole,
  showLocation = false,
}: {
  assets: Asset[];
  locationId: string;
  userRole: string;
  showLocation?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [assets, setAssets] = useState(initialAssets);
  const [search, setSearch] = useState("");
  const canEdit = userRole === "ADMIN" || userRole === "EDITOR";

  const filtered = assets.filter((a) => {
    const q = search.toLowerCase();
    return (
      !q ||
      a.model?.toLowerCase().includes(q) ||
      a.serialNumber?.toLowerCase().includes(q) ||
      a.hostname?.toLowerCase().includes(q) ||
      a.type?.name.toLowerCase().includes(q) ||
      a.manufacturer?.name.toLowerCase().includes(q) ||
      a.macAddresses.some((m) => m.address.toLowerCase().includes(q))
    );
  });

  async function handleDelete(id: string) {
    const res = await fetch(`/api/assets/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json();
      toast({ title: "Error", description: err.error, variant: "destructive" });
      return;
    }
    toast({ title: "Asset deleted" });
    setAssets((prev) => prev.filter((a) => a.id !== id));
    router.refresh();
  }

  if (assets.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground border rounded-lg">
        <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
        <p>No assets in this location yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search assets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Type</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Manufacturer</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Model</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Serial #</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Hostname</th>
              {showLocation && (
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Location</th>
              )}
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Installed</th>
              <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={showLocation ? 8 : 7} className="text-center py-8 text-muted-foreground">
                  No assets match your search
                </td>
              </tr>
            ) : (
              filtered.map((asset, i) => (
                <tr
                  key={asset.id}
                  className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${
                    i % 2 === 0 ? "" : "bg-muted/10"
                  }`}
                >
                  <td className="px-4 py-2.5">
                    {asset.type ? (
                      <Badge variant="outline" className="text-xs">{asset.type.name}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {asset.manufacturer?.name || "—"}
                  </td>
                  <td className="px-4 py-2.5 font-medium">
                    <Link
                      href={`/locations/${locationId}/assets/${asset.id}`}
                      className="hover:text-primary flex items-center gap-1"
                    >
                      {asset.model || <span className="text-muted-foreground italic">No model</span>}
                      <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">
                    {asset.serialNumber || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {asset.hostname || "—"}
                  </td>
                  {showLocation && (
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {asset.location ? (
                        <Link href={`/locations/${asset.location.id}`} className="hover:text-primary">
                          {asset.location.name}
                        </Link>
                      ) : "—"}
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">
                    {formatDate(asset.installationDate)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      {asset._count.attachments > 0 && (
                        <Badge variant="secondary" className="text-xs mr-1">
                          {asset._count.attachments} files
                        </Badge>
                      )}
                      {canEdit && (
                        <>
                          <AssetFormDialog
                            mode="edit"
                            assetId={asset.id}
                            locationId={locationId}
                            onSuccess={() => router.refresh()}
                          >
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                          </AssetFormDialog>

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this asset?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete the asset and all its attachments.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(asset.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          {filtered.length} of {assets.length} asset{assets.length !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
