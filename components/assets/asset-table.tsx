"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AssetFormDialog } from "@/components/assets/asset-form-dialog";
import { RemoveAssetDialog } from "@/components/assets/remove-asset-dialog";
import { BulkDecommissionDialog } from "@/components/assets/bulk-decommission-dialog";
import { BulkReturnToStockDialog } from "@/components/assets/bulk-return-to-stock-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
import { formatDate } from "@/lib/dates";
import { Search, Package, Pencil, Trash2, ExternalLink, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { renderHostnameUrl } from "@/lib/url-templates";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as permissions from "@/lib/permissions";
import type { Role } from "@/lib/permissions";
import type { AssetListRow } from "@/lib/assets/include";
import { escapeCsvCell } from "@/lib/csv/core";
import { SortableTh } from "@/components/ui/sortable-th";
import { paginate, useRowSelection } from "@/components/ui/use-row-selection";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

/** A row as the location and asset-type pages pass it in. */
export type AssetRow = AssetListRow;

type SortCol = "type" | "manufacturer" | "model" | "serialNumber" | "hostname" | "installationDate" | "location";

function exportToCsv(assets: AssetRow[], filename: string, headers: string[]) {
  const rows = assets.map((a) => [
    a.type?.name,
    a.manufacturer?.name,
    a.model?.name,
    a.serialNumber,
    a.hostname,
    a.macAddresses.map((m) => m.address).join("; "),
    String(a.quantity),
    a.location.name,
    a.installationDate ? new Date(a.installationDate).toLocaleDateString("sv-SE") : null,
  ].map((cell) => escapeCsvCell(cell)).join(";"));
  // Same ';' delimiter and line endings as the server-side CSV exports.
  const csv = [headers.map((h) => escapeCsvCell(h)).join(";"), ...rows].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function AssetTable({
  assets: initialAssets,
  locationId,
  userRole,
  showLocation = false,
  hostnameUrlTemplate,
}: {
  assets: AssetRow[];
  locationId: string;
  userRole: Role;
  showLocation?: boolean;
  hostnameUrlTemplate?: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("asset");
  const tField = useTranslations("field");
  const tCommon = useTranslations("common");
  const tDecom = useTranslations("decommissioned");
  const [assets, setAssets] = useState(initialAssets);
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<SortCol | null>("type");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const { selected, setSelected, toggleAll, toggleRow: toggleSelectRow, allSelectedIn, someSelectedIn } = useRowSelection();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [bulkDecommissionOpen, setBulkDecommissionOpen] = useState(false);
  const [bulkReturnToStockOpen, setBulkReturnToStockOpen] = useState(false);
  const canEdit = permissions.canEdit(userRole);

  // Sync local state when the parent re-fetches (e.g. after router.refresh()
  // from AssetFormDialog). Without this, useState's initializer runs only
  // once and newly added assets don't appear until a manual page reload.
  useEffect(() => {
    setAssets(initialAssets);
    setSelected((prev) => new Set([...prev].filter((id) => initialAssets.some((a) => a.id === id))));
  }, [initialAssets, setSelected]);

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
    setPage(1);
  }

  useEffect(() => { setPage(1); setSelected(new Set()); }, [search, setSelected]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return assets.filter((a) =>
      !q ||
      a.model?.name.toLowerCase().includes(q) ||
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
      else if (sortCol === "model") { av = a.model?.name ?? ""; bv = b.model?.name ?? ""; }
      else if (sortCol === "serialNumber") { av = a.serialNumber ?? ""; bv = b.serialNumber ?? ""; }
      else if (sortCol === "hostname") { av = a.hostname ?? ""; bv = b.hostname ?? ""; }
      else if (sortCol === "installationDate") { av = String(a.installationDate ?? ""); bv = String(b.installationDate ?? ""); }
      else if (sortCol === "location") { av = a.location.name; bv = b.location.name; }
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [filtered, sortCol, sortDir]);

  const { totalPages, safePage, pageRows: paginated } = paginate(sorted, page, pageSize);

  function handleRemoved(id: string) {
    setAssets((prev) => prev.filter((a) => a.id !== id));
    router.refresh();
  }

  const allFilteredSelected = allSelectedIn(filtered);
  const someFilteredSelected = someSelectedIn(filtered);

  function handleBulkComplete(
    action: "decommission" | "returnToStock",
    result: { succeeded: string[]; failed: { id: string; reason: string }[] }
  ) {
    setSelected(new Set());
    const title = action === "decommission"
      ? tDecom("bulkDecommissionSuccessToast", { count: result.succeeded.length })
      : t("bulkReturnToStockSuccessToast", { count: result.succeeded.length });
    if (result.failed.length === 0) {
      toast({ title });
    } else {
      toast({
        title,
        description: tDecom("bulkSkippedSummary", { count: result.failed.length }),
        variant: "destructive",
      });
    }
    router.refresh();
  }

  if (assets.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground border border-border rounded-[10px] bg-card">
        <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
        <p>{t("noAssetsInLocation")}</p>
      </div>
    );
  }

  const colSpan = (showLocation ? 8 : 7) + (canEdit ? 1 : 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            aria-label={t("searchAssets")}
            placeholder={t("searchAssets")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-[36px] text-[13px] rounded-[8px]"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-[36px] px-3 text-[13px] gap-1.5 flex-shrink-0"
          onClick={() => exportToCsv(sorted, "assets.csv", [tField("type"), tField("manufacturer"), tField("model"), tField("serialNumber"), tField("hostname"), tField("macAddresses"), tField("quantity"), tField("location"), tField("installed")])}
          title={t("exportTitle")}
        >
          <Download className="h-3.5 w-3.5" />
          {t("exportCsv")}
        </Button>
      </div>

      {canEdit && selected.size > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-[8px] bg-primary-tint text-[12.5px] text-primary">
          <span className="font-medium">{t("itemsSelected", { count: selected.size })}</span>
          <Button
            size="sm"
            className="h-7 bg-[#ca8a04] hover:bg-[#a16207] text-white"
            onClick={() => setBulkDecommissionOpen(true)}
          >
            {tDecom("decommissionAsset")}
          </Button>
          <Button
            size="sm"
            className="h-7 bg-primary hover:bg-primary-hover text-white"
            onClick={() => setBulkReturnToStockOpen(true)}
          >
            {t("returnToStock")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-primary hover:bg-primary-tint-hover"
            onClick={() => setSelected(new Set())}
          >
            {t("clearSelection")}
          </Button>
        </div>
      )}

      <div className="rounded-[10px] border border-border overflow-hidden bg-card">
        <table className="w-full text-[13px]">
          <caption className="sr-only">{t("assetCount", { count: sorted.length })}</caption>
          <thead>
            <tr className="border-b border-border bg-background">
              {canEdit && (
                <th scope="col" className="w-[36px] px-4 py-[10px]">
                  <Checkbox
                    checked={allFilteredSelected ? true : someFilteredSelected ? "indeterminate" : false}
                    onCheckedChange={() => toggleAll(filtered)}
                    aria-label={t("selectAllRows")}
                  />
                </th>
              )}
              <SortableTh col="type" label={tField("type")} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <SortableTh col="manufacturer" label={tField("manufacturer")} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <SortableTh col="model" label={tField("model")} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <SortableTh col="serialNumber" label={tField("serialNumber")} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <SortableTh col="hostname" label={tField("hostname")} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              {showLocation && <SortableTh col="location" label={tField("location")} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
              <SortableTh col="installationDate" label={tField("installed")} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <th scope="col" className="text-right px-4 py-[10px] text-[12px] font-medium text-muted-foreground">{tCommon("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="text-center py-8 text-muted-foreground">
                  {t("noAssetsInLocation")}
                </td>
              </tr>
            ) : (
              paginated.map((asset) => {
                const assetLocationId = asset.location.id;
                const assetHref = `/locations/${assetLocationId}/assets/${asset.id}`;
                return (
                <tr
                  key={asset.id}
                  role="link"
                  tabIndex={0}
                  aria-label={`Open asset ${asset.model?.name || asset.hostname || asset.serialNumber || "details"}`}
                  className="border-b border-border last:border-0 hover:bg-background transition-colors duration-75 cursor-pointer focus-visible:outline-none focus-visible:bg-primary-tint"
                  onClick={() => router.push(assetHref)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); router.push(assetHref); }
                  }}
                >
                  {canEdit && (
                    <td className="px-4 py-[11px]" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(asset.id)}
                        onCheckedChange={() => toggleSelectRow(asset.id)}
                        aria-label={t("selectRow", { name: asset.model?.name || asset.hostname || asset.serialNumber || asset.id })}
                      />
                    </td>
                  )}
                  <td className="px-4 py-[11px]">
                    {asset.type ? (
                      <span className="inline-flex items-center text-[11px] font-semibold bg-primary-tint text-primary px-2 py-0.5 rounded-[5px]">
                        {asset.type.name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-[11px] text-muted-foreground">
                    {asset.manufacturer?.name || "—"}
                  </td>
                  <td className="px-4 py-[11px] font-medium text-foreground">
                    {asset.model?.name || <span className="text-muted-foreground font-normal italic">{t("noModel")}</span>}
                    {asset.quantity > 1 && (
                      <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">×{asset.quantity}</span>
                    )}
                  </td>
                  <td className="px-4 py-[11px] text-muted-foreground font-mono text-[11.5px]">
                    {asset.serialNumber || "—"}
                  </td>
                  <td className="px-4 py-[11px] text-muted-foreground font-mono text-[11.5px]">
                    {asset.hostname && hostnameUrlTemplate ? (
                      <a
                        href={renderHostnameUrl(hostnameUrlTemplate, asset)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-primary underline inline-flex items-center gap-1"
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
                    <td className="px-4 py-[11px] text-muted-foreground" onClick={(e) => e.stopPropagation()}>
                      {asset.location ? (
                        <Link href={`/locations/${asset.location.id}`} className="hover:text-primary">
                          {asset.location.name}
                        </Link>
                      ) : "—"}
                    </td>
                  )}
                  <td className="px-4 py-[11px] text-muted-foreground text-[12px]">
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
                              aria-label={`Edit asset ${asset.model?.name || asset.hostname || asset.serialNumber || asset.id}`}
                              className="h-[30px] w-[30px] border border-border rounded-md bg-background hover:bg-card"
                            >
                              <Pencil className="h-3.5 w-3.5 text-primary" />
                            </Button>
                          </AssetFormDialog>

                          <RemoveAssetDialog
                            assetId={asset.id}
                            assetName={asset.model?.name || asset.hostname || asset.serialNumber || asset.id}
                            assetStatus={asset.status}
                            onRemoved={() => handleRemoved(asset.id)}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Remove asset ${asset.model?.name || asset.hostname || asset.serialNumber || asset.id}`}
                              className="h-[30px] w-[30px] text-destructive hover:text-destructive hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </RemoveAssetDialog>
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
        <p className="text-[12px] text-muted-foreground">
          {sorted.length === 0 ? (
            <>0 {tCommon("of")} {t("assetCount", { count: assets.length })}</>
          ) : (
            <>
              {t("pagination", { from: (safePage - 1) * pageSize + 1, to: Math.min(safePage * pageSize, sorted.length), total: sorted.length })}
              {sorted.length !== assets.length && ` ${t("filteredFrom", { total: assets.length })}`}
              {" "}{t("assetCount", { count: assets.length })}
            </>
          )}
        </p>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] text-muted-foreground">{t("rowsPerPage")}</span>
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

          <nav className="flex items-center gap-1" aria-label="Pagination">
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous page"
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
                  <span key={`ellipsis-${i}`} className="text-[12px] text-subtle px-1" aria-hidden="true">…</span>
                ) : (
                  <Button
                    key={p}
                    variant={p === safePage ? "default" : "outline"}
                    size="icon"
                    aria-label={`Go to page ${p}`}
                    aria-current={p === safePage ? "page" : undefined}
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
              aria-label="Next page"
              className="h-[30px] w-[30px]"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </nav>
        </div>
      </div>

      <BulkDecommissionDialog
        open={bulkDecommissionOpen}
        onOpenChange={setBulkDecommissionOpen}
        assetIds={[...selected]}
        onComplete={(result) => handleBulkComplete("decommission", result)}
      />
      <BulkReturnToStockDialog
        open={bulkReturnToStockOpen}
        onOpenChange={setBulkReturnToStockOpen}
        assetIds={[...selected]}
        onComplete={(result) => handleBulkComplete("returnToStock", result)}
      />
    </div>
  );
}
