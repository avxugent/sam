"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SortableTh } from "@/components/ui/sortable-th";
import { formatDate } from "@/lib/dates";
import { assetLabel } from "@/lib/assets/label";

/** One asset in a lifecycle-state list (decommissioned, in repair). */
export type AssetStateRow = {
  id: string;
  locationId: string;
  model: { name: string } | null;
  serialNumber: string | null;
  type: { id: string; name: string } | null;
  manufacturer: { id: string; name: string } | null;
  locationName: string | null;
  locationFiNumber?: string | null;
  /** When the asset entered this state. */
  since: string | null;
  note: string | null;
};

type SortCol = "type" | "model" | "serialNumber" | "location" | "since";

/** Searchable, sortable table shared by the decommissioned and in-repair pages. */
export function AssetStateTable({
  rows,
  labels,
  renderActions,
}: {
  rows: AssetStateRow[];
  labels: { search: string; location: string; since: string; note: string; empty: string };
  /** Optional trailing action cell per row (adds a column). */
  renderActions?: (row: AssetStateRow) => ReactNode;
}) {
  const tStock = useTranslations("stock");
  const tAsset = useTranslations("asset");
  const [query, setQuery] = useState("");
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }

  const filtered = rows.filter((a) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      a.model?.name.toLowerCase().includes(q) ||
      a.serialNumber?.toLowerCase().includes(q) ||
      a.type?.name.toLowerCase().includes(q) ||
      a.manufacturer?.name.toLowerCase().includes(q) ||
      a.locationName?.toLowerCase().includes(q) ||
      a.note?.toLowerCase().includes(q)
    );
  });

  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    const key = (a: AssetStateRow) =>
      sortCol === "type" ? a.type?.name
      : sortCol === "model" ? a.model?.name
      : sortCol === "serialNumber" ? a.serialNumber
      : sortCol === "location" ? a.locationName
      : a.since;
    return [...filtered].sort((a, b) => {
      const cmp = (key(a) ?? "").localeCompare(key(b) ?? "");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortCol, sortDir]);

  const th = (col: SortCol, label: string) => (
    <SortableTh variant="compact" col={col} label={label} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
  );
  const columnCount = renderActions ? 7 : 6;

  return (
    <div className="space-y-3">
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-subtle" />
        <Input
          placeholder={labels.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8 h-8 text-[13px]"
        />
      </div>

      <div className="border border-border rounded-[10px] overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-background border-b border-border">
            <tr>
              {th("type", tStock("type"))}
              {th("model", tStock("model"))}
              {th("serialNumber", tStock("serial"))}
              {th("location", labels.location)}
              {th("since", labels.since)}
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{labels.note}</th>
              {renderActions && <th className="px-3 py-2.5 w-[60px]" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-muted">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="px-3 py-8 text-center text-[13px] text-subtle">
                  {labels.empty}
                </td>
              </tr>
            ) : (
              sorted.map((asset) => (
                <tr key={asset.id} className="hover:bg-background transition-colors">
                  <td className="px-3 py-2.5">
                    {asset.type ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[11px] font-medium">
                        {asset.type.name}
                      </span>
                    ) : <span className="text-subtle">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/locations/${asset.locationId}/assets/${asset.id}`}
                      className="font-medium text-foreground hover:text-primary hover:underline"
                    >
                      {assetLabel(asset) ?? tAsset("unnamedAsset")}
                    </Link>
                    {asset.manufacturer && (
                      <span className="text-[11.5px] text-subtle ml-1.5">{asset.manufacturer.name}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {asset.serialNumber
                      ? <span className="font-mono text-[11.5px] text-muted-foreground">{asset.serialNumber}</span>
                      : <span className="text-subtle">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    <span className="text-secondary-foreground">{asset.locationName ?? "—"}</span>
                    {asset.locationFiNumber && (
                      <span className="ml-1.5 font-mono text-[11px] text-subtle">{asset.locationFiNumber}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-muted-foreground">
                    {asset.since ? formatDate(asset.since) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-muted-foreground max-w-[200px] truncate">
                    {asset.note || <span className="text-subtle">—</span>}
                  </td>
                  {renderActions && <td className="px-3 py-2.5">{renderActions(asset)}</td>}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
