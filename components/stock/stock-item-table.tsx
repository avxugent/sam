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
import { canEdit, type Role } from "@/lib/permissions";
import { SortableTh } from "@/components/ui/sortable-th";
import { toIsoDay } from "@/lib/dates";
import { stockMetadataMacs } from "@/lib/stock-metadata";
import { paginate, useRowSelection, useTableSort } from "@/components/ui/use-row-selection";
import { apiFetch } from "@/lib/api-client";
import { useApiErrorToast } from "@/components/ui/use-api-error-toast";

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
  invoiceDate: string | null;
  notes: string | null;
  locationId: string | null;
  reservedForLocationId: string | null;
  metadata: string | null;
  type: { id: string; name: string };
  manufacturer: { id: string; name: string } | null;
  location: { id: string; name: string } | null;
};

const SORT_KEYS = {
  type: (i: StockItem) => i.type.name,
  manufacturer: (i: StockItem) => i.manufacturer?.name ?? "",
  model: (i: StockItem) => i.model?.name ?? "",
  serialNumber: (i: StockItem) => i.serialNumber ?? "",
  quantity: (i: StockItem) => i.quantity,
};
type SortCol = keyof typeof SORT_KEYS;

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
  const showApiError = useApiErrorToast();
  const t = useTranslations("stock");
  const tCommon = useTranslations("common");
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(25);
  const { selected, setSelected, toggleAll, toggleRow: toggleSelectRow, allSelectedIn, someSelectedIn } = useRowSelection();
  const [page, setPage] = useState(1);
  const [deployItem, setDeployItem] = useState<StockItem | null>(null);
  const [bulkRelocateOpen, setBulkRelocateOpen] = useState(false);

  const editable = canEdit(userRole);

  useEffect(() => {
    setItems(initialItems);
    setSelected((prev) => new Set([...prev].filter((id) => initialItems.some((i) => i.id === id))));
  }, [initialItems, setSelected]);

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

  const { sortCol, sortDir, handleSort, sorted } = useTableSort(filtered, SORT_KEYS, "type");

  function toggleSort(col: SortCol) {
    handleSort(col);
    setPage(1);
  }

  const { totalPages, safePage, pageRows: paginated } = paginate(sorted, page, pageSize);

  const allFilteredSelected = allSelectedIn(filtered);
  const someFilteredSelected = someSelectedIn(filtered);

  async function handleDelete(id: string) {
    const res = await apiFetch(`/api/stock/${id}`, { method: "DELETE" });
    if (!res.ok) {
      showApiError(res.error);
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
    toast({ title: t("stockItemDeleted") });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-subtle" />
          <Input
            placeholder={t("searchStock")}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); setSelected(new Set()); }}
            className="pl-8 h-8 text-[13px]"
          />
        </div>
        <span className="text-[12px] text-subtle ml-auto">
          {filtered.length} {filtered.length !== 1 ? t("items") : t("item")}
        </span>
      </div>

      {/* Bulk actions toolbar */}
      {editable && selected.size > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-[8px] bg-primary-tint text-[12.5px] text-primary">
          <span className="font-medium">{t("itemsSelected", { count: selected.size })}</span>
          <Button
            size="sm"
            className="h-7 bg-primary hover:bg-primary-hover text-white"
            onClick={() => setBulkRelocateOpen(true)}
          >
            {t("relocateSelected")}
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

      <div className="border border-border rounded-[10px] overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-background border-b border-border">
            <tr>
              {editable && (
                <th className="px-3 py-2.5 w-[36px]">
                  <Checkbox
                    checked={allFilteredSelected ? true : someFilteredSelected ? "indeterminate" : false}
                    onCheckedChange={() => toggleAll(filtered)}
                    aria-label={t("selectAllRows")}
                  />
                </th>
              )}
              <SortableTh variant="compact" col="type" label={t("type")} sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
              <SortableTh variant="compact" col="manufacturer" label={t("manufacturer")} sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
              <SortableTh variant="compact" col="model" label={t("model")} sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
              <SortableTh variant="compact" col="serialNumber" label={t("serial")} sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
              <SortableTh variant="compact" col="quantity" label={t("qty")} sortCol={sortCol} sortDir={sortDir} onSort={toggleSort} />
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                {t("location")}
              </th>
              {editable && <th className="px-3 py-2.5 w-[100px]" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-muted">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={editable ? 8 : 6} className="px-3 py-8 text-center text-[13px] text-subtle">
                  {t("noStockItems")}
                </td>
              </tr>
            ) : (
              paginated.map((item) => (
                <tr key={item.id} className="hover:bg-background transition-colors">
                  {editable && (
                    <td className="px-3 py-2.5">
                      <Checkbox
                        checked={selected.has(item.id)}
                        onCheckedChange={() => toggleSelectRow(item.id)}
                        aria-label={t("selectRow", { model: item.model?.name ?? "" })}
                      />
                    </td>
                  )}
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary-tint text-primary text-[11px] font-medium">
                      {item.type.name}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{item.manufacturer?.name ?? "—"}</td>
                  <td className="px-3 py-2.5 font-medium text-foreground">{item.model?.name ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    {item.serialNumber
                      ? <span className="font-mono text-[11.5px] text-muted-foreground">{item.serialNumber}</span>
                      : <span className="text-subtle">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {item.serialNumber ? "—" : <span className="font-medium text-foreground">×{item.quantity}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground text-[12.5px]">
                    {item.locationId
                      ? locationBreadcrumbs[item.locationId] ?? item.location?.name ?? "—"
                      : <span className="text-subtle">{t("unassigned")}</span>}
                  </td>
                  {editable && (
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-primary hover:bg-primary-tint"
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
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-muted">
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </StockItemFormDialog>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 hover:bg-danger-surface">
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
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
                                className="bg-destructive hover:bg-destructive/90 text-white"
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
        <div className="flex items-center justify-between text-[12px] text-muted-foreground">
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
