"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
import { StockItemFormDialog, type StockItemInitialData } from "@/components/stock/stock-item-form-dialog";
import { DeployStockDialog } from "@/components/stock/deploy-stock-dialog";
import { BulkRelocateDialog } from "@/components/stock/bulk-relocate-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
import {
  Search,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  ArrowRightFromLine,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as permissions from "@/lib/permissions";
import type { Role } from "@/lib/permissions";
import { SortableTh } from "@/components/ui/sortable-th";
import { toIsoDay } from "@/lib/utils";
import { stockMetadataMacs } from "@/lib/stock-metadata";

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

export type StockItem = {
  id: string;
  typeId: string;
  manufacturerId: string | null;
  modelId: string | null;
  model: { id: string; name: string } | null;
  serialNumber: string | null;
  quantity: number;
  invoiceNumber: string | null;
  invoiceDate: Date | string | null;
  notes: string | null;
  locationId: string | null;
  reservedForLocationId: string | null;
  metadata: string | null;
  type: { id: string; name: string };
  manufacturer: { id: string; name: string } | null;
  location: { id: string; name: string } | null;
};

type SortCol = "type" | "manufacturer" | "model" | "serialNumber" | "quantity";

export function StockItemTable({
  items: initialItems,
  userRole,
  locationBreadcrumbs = {},
}: {
  items: StockItem[];
  userRole: Role;
  locationBreadcrumbs?: Record<string, string>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("stock");
  const tCommon = useTranslations("common");
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [sortCol, setSortCol] = useState<SortCol>("type");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(25);
  const [page, setPage] = useState(1);
  const [deployItem, setDeployItem] = useState<StockItem | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRelocateOpen, setBulkRelocateOpen] = useState(false);

  const canEdit = permissions.canEdit(userRole);

  useEffect(() => {
    setItems(initialItems);
    setSelected((prev) => new Set([...prev].filter((id) => initialItems.some((i) => i.id === id))));
  }, [initialItems]);

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
    setPage(1);
  }

  const filtered = useMemo(() => {
    const ql = query.toLowerCase();
    return items.filter((i) =>
      !ql ||
      i.model?.name.toLowerCase().includes(ql) ||
      i.serialNumber?.toLowerCase().includes(ql) ||
      i.type.name.toLowerCase().includes(ql) ||
      i.manufacturer?.name.toLowerCase().includes(ql)
    );
  }, [items, query]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let va = "", vb = "";
      if (sortCol === "type") { va = a.type.name; vb = b.type.name; }
      else if (sortCol === "manufacturer") { va = a.manufacturer?.name ?? ""; vb = b.manufacturer?.name ?? ""; }
      else if (sortCol === "model") { va = a.model?.name ?? ""; vb = b.model?.name ?? ""; }
      else if (sortCol === "serialNumber") { va = a.serialNumber ?? ""; vb = b.serialNumber ?? ""; }
      else if (sortCol === "quantity") return sortDir === "asc" ? a.quantity - b.quantity : b.quantity - a.quantity;
      return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  }, [filtered, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  function toggleSelectAll() {
    setSelected((prev) =>
      filtered.length > 0 && filtered.every((i) => prev.has(i.id))
        ? new Set()
        : new Set(filtered.map((i) => i.id))
    );
  }

  function toggleSelectRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allFilteredSelected = filtered.length > 0 && filtered.every((i) => selected.has(i.id));
  const someFilteredSelected = !allFilteredSelected && filtered.some((i) => selected.has(i.id));

  async function handleDelete(id: string) {
    const res = await fetch(`/api/stock/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json();
      toast({ title: tCommon("error"), description: err.error, variant: "destructive" });
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
    toast({ title: t("stockItemDeleted") });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#94a3b8]" />
          <Input
            placeholder={t("searchStock")}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); setSelected(new Set()); }}
            className="pl-8 h-8 text-[13px]"
          />
        </div>
        <span className="text-[12px] text-[#94a3b8] ml-auto">
          {filtered.length} {filtered.length !== 1 ? t("items") : t("item")}
        </span>
      </div>

      {/* Bulk actions toolbar */}
      {canEdit && selected.size > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-[8px] bg-[#e8f0fc] text-[12.5px] text-[#1e64c8]">
          <span className="font-medium">{t("itemsSelected", { count: selected.size })}</span>
          <Button
            size="sm"
            className="h-7 bg-[#1e64c8] hover:bg-[#1a56b0] text-white"
            onClick={() => setBulkRelocateOpen(true)}
          >
            {t("relocateSelected")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[#1e64c8] hover:bg-[#dbe9fb]"
            onClick={() => setSelected(new Set())}
          >
            {t("clearSelection")}
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="border border-[#e2e8f0] rounded-[10px] overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-[#f8fafc] border-b border-[#e2e8f0]">
            <tr>
              {canEdit && (
                <th className="px-3 py-2.5 w-[36px]">
                  <Checkbox
                    checked={allFilteredSelected ? true : someFilteredSelected ? "indeterminate" : false}
                    onCheckedChange={toggleSelectAll}
                    aria-label={t("selectAllRows")}
                  />
                </th>
              )}
              <SortableTh variant="compact" col="type" label={t("type")} sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
              <SortableTh variant="compact" col="manufacturer" label={t("manufacturer")} sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
              <SortableTh variant="compact" col="model" label={t("model")} sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
              <SortableTh variant="compact" col="serialNumber" label={t("serial")} sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
              <SortableTh variant="compact" col="quantity" label={t("qty")} sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-[#64748b] uppercase tracking-wide">
                {t("location")}
              </th>
              {canEdit && <th className="px-3 py-2.5 w-[100px]" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f5f9]">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 8 : 6} className="px-3 py-8 text-center text-[13px] text-[#94a3b8]">
                  {t("noStockItems")}
                </td>
              </tr>
            ) : (
              paginated.map((item) => (
                <tr key={item.id} className="hover:bg-[#f8fafc] transition-colors">
                  {canEdit && (
                    <td className="px-3 py-2.5">
                      <Checkbox
                        checked={selected.has(item.id)}
                        onCheckedChange={() => toggleSelectRow(item.id)}
                        aria-label={t("selectRow", { model: item.model?.name ?? "" })}
                      />
                    </td>
                  )}
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#e8f0fc] text-[#1e64c8] text-[11px] font-medium">
                      {item.type.name}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[#64748b]">{item.manufacturer?.name ?? "—"}</td>
                  <td className="px-3 py-2.5 font-medium text-[#0f172a]">{item.model?.name ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    {item.serialNumber
                      ? <span className="font-mono text-[11.5px] text-[#64748b]">{item.serialNumber}</span>
                      : <span className="text-[#cbd5e1]">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-[#64748b]">
                    {item.serialNumber ? "—" : <span className="font-medium text-[#0f172a]">×{item.quantity}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-[#64748b] text-[12.5px]">
                    {item.locationId
                      ? locationBreadcrumbs[item.locationId] ?? item.location?.name ?? "—"
                      : <span className="text-[#cbd5e1]">{t("unassigned")}</span>}
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-[#1e64c8] hover:bg-[#e8f0fc]"
                          title={t("deployTo")}
                          onClick={() => setDeployItem(item)}
                        >
                          <ArrowRightFromLine className="h-3.5 w-3.5" />
                        </Button>
                        <StockItemFormDialog
                          mode="edit"
                          itemId={item.id}
                          initialData={{
                            typeId: item.typeId,
                            typeName: item.type.name,
                            manufacturerId: item.manufacturerId ?? null,
                            manufacturerName: item.manufacturer?.name ?? null,
                            modelId: item.modelId ?? "",
                            serialNumber: item.serialNumber ?? null,
                            quantity: item.quantity,
                            notes: item.notes ?? null,
                            locationId: item.locationId ?? null,
                            locationBreadcrumb: item.locationId
                              ? locationBreadcrumbs[item.locationId] ?? item.location?.name ?? null
                              : null,
                            invoiceNumber: item.invoiceNumber ?? null,
                            invoiceDate: item.invoiceDate
                              ? toIsoDay(item.invoiceDate)
                              : null,
                            macAddresses: stockMetadataMacs(item.metadata),
                          } satisfies StockItemInitialData}
                          onSuccess={() => router.refresh()}
                        >
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-[#f1f5f9]">
                            <Pencil className="h-3.5 w-3.5 text-[#64748b]" />
                          </Button>
                        </StockItemFormDialog>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-[#fee2e2]">
                              <Trash2 className="h-3.5 w-3.5 text-[#ef4444]" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {t("deleteConfirmDescription", { model: item.model?.name ?? "" })}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(item.id)}
                                className="bg-[#ef4444] hover:bg-[#dc2626] text-white"
                              >
                                {tCommon("delete")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {sorted.length > pageSize && (
        <div className="flex items-center justify-between text-[12px] text-[#64748b]">
          <div className="flex items-center gap-2">
            <span>{t("rowsPerPage")}</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => { setPageSize(Number(v) as typeof PAGE_SIZE_OPTIONS[number]); setPage(1); }}
            >
              <SelectTrigger className="h-7 w-16 text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5">
            <span>{(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, sorted.length)} of {sorted.length}</span>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
              <ChevronUp className="h-3.5 w-3.5 rotate-[-90deg]" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>
              <ChevronDown className="h-3.5 w-3.5 rotate-[-90deg]" />
            </Button>
          </div>
        </div>
      )}

      {/* Deploy dialog */}
      {deployItem && (
        <DeployStockDialog
          open={!!deployItem}
          onOpenChange={(v) => { if (!v) setDeployItem(null); }}
          itemId={deployItem.id}
          itemModel={deployItem.model?.name ?? ""}
          itemSerial={deployItem.serialNumber}
          availableQuantity={deployItem.quantity}
        />
      )}

      {/* Bulk relocate dialog */}
      <BulkRelocateDialog
        open={bulkRelocateOpen}
        onOpenChange={setBulkRelocateOpen}
        itemIds={[...selected]}
        onComplete={(result) => {
          setSelected(new Set());
          if (result.failed.length === 0) {
            toast({ title: t("bulkRelocateSuccessToast", { count: result.succeeded.length }) });
          } else {
            toast({
              title: t("bulkRelocateSuccessToast", { count: result.succeeded.length }),
              description: t("bulkRelocateSkipped", { count: result.failed.length }),
              variant: "destructive",
            });
          }
          router.refresh();
        }}
      />
    </div>
  );
}
