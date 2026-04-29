"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
import { Search, Package, Pencil, Trash2, ChevronUp, ChevronDown, ExternalLink, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { renderHostnameUrl, renderMacAddressUrl } from "@/lib/hostname-template";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

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
  location?: { id: string; name: string } | null;
};

type SortCol = "type" | "manufacturer" | "model" | "serialNumber" | "hostname" | "installationDate" | "location";

function escapeCell(v: string | null | undefined): string {
  const s = v ?? "";
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportToCsv(assets: Asset[], filename: string) {
  const header = ["Type", "Manufacturer", "Model", "Serial Number", "Hostname", "MAC Addresses", "Location", "Installation Date"];
  const rows = assets.map((a) => [
    a.type?.name,
    a.manufacturer?.name,
    a.model,
    a.serialNumber,
    a.hostname,
    a.macAddresses.map((m) => m.address).join("; "),
    a.location?.name,
    a.installationDate ? new Date(a.installationDate).toLocaleDateString() : null,
  ].map(escapeCell).join(","));
  const csv = [header.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function SortIcon({ col, active, dir }: { col: string; active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <ChevronUp className="h-2.5 w-2.5 opacity-30" />;
  return dir === "asc"
    ? <ChevronUp className="h-2.5 w-2.5 text-[#1e64c8]" />
    : <ChevronDown className="h-2.5 w-2.5 text-[#1e64c8]" />;
}

export function AssetTable({
  assets: initialAssets,
  locationId,
  userRole,
  showLocation = false,
  hostnameUrlTemplate,
  macAddressUrlTemplate,
}: {
  assets: Asset[];
  locationId: string;
  userRole: string;
  showLocation?: boolean;
  hostnameUrlTemplate?: string | null;
  macAddressUrlTemplate?: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [assets, setAssets] = useState(initialAssets);
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const canEdit = userRole === "ADMIN" || userRole === "EDITOR";

  // Sync local state when the parent re-fetches (e.g. after router.refresh()
  // from AssetFormDialog). Without this, useState's initializer runs only
  // once and newly added assets don't appear until a manual page reload.
  useEffect(() => { setAssets(initialAssets); }, [initialAssets]);

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
    setPage(1);
  }

  useEffect(() => { setPage(1); }, [search]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return assets.filter((a) =>
      !q ||
      a.model?.toLowerCase().includes(q) ||
      a.serialNumber?.toLowerCase().includes(q) ||
      a.hostname?.toLowerCase().includes(q) ||
      a.type?.name.toLowerCase().includes(q) ||
      a.manufacturer?.name.toLowerCase().includes(q) ||
      a.macAddresses.some((m) => m.address.toLowerCase().includes(q))
    );
  }, [assets, search]);

  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    return [...filtered].sort((a, b) => {
      let av = "";
      let bv = "";
      if (sortCol === "type") { av = a.type?.name ?? ""; bv = b.type?.name ?? ""; }
      else if (sortCol === "manufacturer") { av = a.manufacturer?.name ?? ""; bv = b.manufacturer?.name ?? ""; }
      else if (sortCol === "model") { av = a.model ?? ""; bv = b.model ?? ""; }
      else if (sortCol === "serialNumber") { av = a.serialNumber ?? ""; bv = b.serialNumber ?? ""; }
      else if (sortCol === "hostname") { av = a.hostname ?? ""; bv = b.hostname ?? ""; }
      else if (sortCol === "installationDate") { av = String(a.installationDate ?? ""); bv = String(b.installationDate ?? ""); }
      else if (sortCol === "location") { av = a.location?.name ?? ""; bv = b.location?.name ?? ""; }
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [filtered, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

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
      <div className="text-center py-12 text-muted-foreground border border-[#e2e8f0] rounded-[10px] bg-white">
        <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
        <p>No assets in this location yet</p>
      </div>
    );
  }

  function Th({ col, label }: { col: SortCol; label: string }) {
    const active = sortCol === col;
    return (
      <th
        className="text-left px-4 py-[10px] text-[12px] font-medium text-[#64748b] cursor-pointer select-none whitespace-nowrap"
        onClick={() => handleSort(col)}
      >
        <span className={`inline-flex items-center gap-1 ${active ? "text-[#1e64c8]" : ""}`}>
          {label}
          <SortIcon col={col} active={active} dir={sortDir} />
        </span>
      </th>
    );
  }

  const colSpan = showLocation ? 8 : 7;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search assets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-[36px] text-[13px] rounded-[8px]"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-[36px] px-3 text-[13px] gap-1.5 flex-shrink-0"
          onClick={() => exportToCsv(sorted, "assets.csv")}
          title="Export all filtered assets"
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </Button>
      </div>

      <div className="rounded-[10px] border border-[#e2e8f0] overflow-hidden bg-white">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
              <Th col="type" label="Type" />
              <Th col="manufacturer" label="Manufacturer" />
              <Th col="model" label="Model" />
              <Th col="serialNumber" label="Serial #" />
              <Th col="hostname" label="Hostname" />
              {showLocation && <Th col="location" label="Location" />}
              <Th col="installationDate" label="Installed" />
              <th className="text-right px-4 py-[10px] text-[12px] font-medium text-[#64748b]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="text-center py-8 text-muted-foreground">
                  No assets match your search
                </td>
              </tr>
            ) : (
              paginated.map((asset) => {
                const assetLocationId = asset.location?.id ?? locationId;
                const assetHref = `/locations/${assetLocationId}/assets/${asset.id}`;
                return (
                <tr
                  key={asset.id}
                  className="border-b border-[#e2e8f0] last:border-0 hover:bg-[#f8fafc] transition-colors duration-75 cursor-pointer"
                  onClick={() => router.push(assetHref)}
                >
                  <td className="px-4 py-[11px]">
                    {asset.type ? (
                      <span className="inline-flex items-center text-[11px] font-semibold bg-[#e8f0fc] text-[#1e64c8] px-2 py-0.5 rounded-[5px]">
                        {asset.type.name}
                      </span>
                    ) : (
                      <span className="text-[#64748b]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-[11px] text-[#64748b]">
                    {asset.manufacturer?.name || "—"}
                  </td>
                  <td className="px-4 py-[11px] font-medium text-[#0f172a]">
                    {asset.model || <span className="text-[#64748b] font-normal italic">No model</span>}
                  </td>
                  <td className="px-4 py-[11px] text-[#64748b] font-mono text-[11.5px]">
                    {asset.serialNumber || "—"}
                  </td>
                  <td className="px-4 py-[11px] text-[#64748b] font-mono text-[11.5px]">
                    {asset.hostname && hostnameUrlTemplate ? (
                      <a
                        href={renderHostnameUrl(hostnameUrlTemplate, asset)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-[#1e64c8] underline inline-flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {asset.hostname}
                        <ExternalLink className="h-3 w-3 opacity-60" />
                      </a>
                    ) : (
                      asset.hostname || "—"
                    )}
                  </td>
                  {showLocation && (
                    <td className="px-4 py-[11px] text-[#64748b]" onClick={(e) => e.stopPropagation()}>
                      {asset.location ? (
                        <Link href={`/locations/${asset.location.id}`} className="hover:text-[#1e64c8]">
                          {asset.location.name}
                        </Link>
                      ) : "—"}
                    </td>
                  )}
                  <td className="px-4 py-[11px] text-[#64748b] text-[12px]">
                    {formatDate(asset.installationDate)}
                  </td>
                  <td className="px-4 py-[11px]" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {canEdit && (
                        <>
                          <AssetFormDialog
                            mode="edit"
                            assetId={asset.id}
                            locationId={locationId}
                            onSuccess={() => router.refresh()}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-[30px] w-[30px] border border-[#e2e8f0] rounded-md bg-[#f8fafc] hover:bg-white"
                            >
                              <Pencil className="h-3.5 w-3.5 text-[#1e64c8]" />
                            </Button>
                          </AssetFormDialog>

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-[30px] w-[30px] text-destructive hover:text-destructive hover:bg-red-50"
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
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-[12px] text-[#64748b]">
          {sorted.length === 0 ? (
            `0 of ${assets.length} asset${assets.length !== 1 ? "s" : ""}`
          ) : (
            <>
              {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, sorted.length)} of {sorted.length}
              {sorted.length !== assets.length && ` (filtered from ${assets.length})`}
              {` asset${assets.length !== 1 ? "s" : ""}`}
            </>
          )}
        </p>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] text-[#64748b]">Per page</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}
            >
              <SelectTrigger className="h-[30px] w-[70px] text-[12px] px-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)} className="text-[12px]">{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-[30px] w-[30px]"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
              .reduce<(number | "…")[]>((acc, p, i, arr) => {
                if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("…");
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === "…" ? (
                  <span key={`ellipsis-${i}`} className="text-[12px] text-[#94a3b8] px-1">…</span>
                ) : (
                  <Button
                    key={p}
                    variant={p === safePage ? "default" : "outline"}
                    size="icon"
                    className="h-[30px] w-[30px] text-[12px]"
                    onClick={() => setPage(p as number)}
                  >
                    {p}
                  </Button>
                )
              )}

            <Button
              variant="outline"
              size="icon"
              className="h-[30px] w-[30px]"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
