"use client";

import { useState, useMemo } from "react";
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
import { StockItemFormDialog } from "@/components/stock/stock-item-form-dialog";
import { DeployStockDialog } from "@/components/stock/deploy-stock-dialog";
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

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

export type StockItem = {
  id: string;
  model: string;
  serialNumber: string | null;
  quantity: number;
  invoiceNumber: string | null;
  invoiceDate: Date | string | null;
  notes: string | null;
  reservedForLocationId: string | null;
  type: { id: string; name: string };
  manufacturer: { id: string; name: string } | null;
};

type SortCol = "type" | "manufacturer" | "model" | "serialNumber" | "quantity";

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <ChevronUp className="h-2.5 w-2.5 opacity-30" />;
  return dir === "asc"
    ? <ChevronUp className="h-2.5 w-2.5 text-[#1e64c8]" />
    : <ChevronDown className="h-2.5 w-2.5 text-[#1e64c8]" />;
}

export function StockItemTable({
  items: initialItems,
  userRole,
}: {
  items: StockItem[];
  userRole: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [sortCol, setSortCol] = useState<SortCol>("type");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(25);
  const [page, setPage] = useState(1);
  const [deployItem, setDeployItem] = useState<StockItem | null>(null);

  const canEdit = userRole === "ADMIN" || userRole === "EDITOR";

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
    setPage(1);
  }

  const filtered = useMemo(() => {
    const ql = query.toLowerCase();
    return items.filter((i) =>
      !ql ||
      i.model.toLowerCase().includes(ql) ||
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
      else if (sortCol === "model") { va = a.model; vb = b.model; }
      else if (sortCol === "serialNumber") { va = a.serialNumber ?? ""; vb = b.serialNumber ?? ""; }
      else if (sortCol === "quantity") return sortDir === "asc" ? a.quantity - b.quantity : b.quantity - a.quantity;
      return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  }, [filtered, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  async function handleDelete(id: string) {
    const res = await fetch(`/api/stock/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json();
      toast({ title: "Error", description: err.error, variant: "destructive" });
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
    toast({ title: "Stock item deleted" });
    router.refresh();
  }

  function Th({ col, label }: { col: SortCol; label: string }) {
    return (
      <th className="px-3 py-2.5 text-left">
        <button
          type="button"
          onClick={() => toggleSort(col)}
          className="flex items-center gap-1 text-[11px] font-semibold text-[#64748b] uppercase tracking-wide hover:text-[#0f172a] transition-colors"
        >
          {label}
          <SortIcon active={sortCol === col} dir={sortDir} />
        </button>
      </th>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#94a3b8]" />
          <Input
            placeholder="Search stock…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            className="pl-8 h-8 text-[13px]"
          />
        </div>
        <span className="text-[12px] text-[#94a3b8] ml-auto">
          {filtered.length} item{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="border border-[#e2e8f0] rounded-[10px] overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-[#f8fafc] border-b border-[#e2e8f0]">
            <tr>
              <Th col="type" label="Type" />
              <Th col="manufacturer" label="Manufacturer" />
              <Th col="model" label="Model" />
              <Th col="serialNumber" label="Serial" />
              <Th col="quantity" label="Qty" />
              {canEdit && <th className="px-3 py-2.5 w-[100px]" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f5f9]">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 6 : 5} className="px-3 py-8 text-center text-[13px] text-[#94a3b8]">
                  No stock items found
                </td>
              </tr>
            ) : (
              paginated.map((item) => (
                <tr key={item.id} className="hover:bg-[#f8fafc] transition-colors">
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#e8f0fc] text-[#1e64c8] text-[11px] font-medium">
                      {item.type.name}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[#64748b]">{item.manufacturer?.name ?? "—"}</td>
                  <td className="px-3 py-2.5 font-medium text-[#0f172a]">{item.model}</td>
                  <td className="px-3 py-2.5">
                    {item.serialNumber
                      ? <span className="font-mono text-[11.5px] text-[#64748b]">{item.serialNumber}</span>
                      : <span className="text-[#cbd5e1]">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-[#64748b]">
                    {item.serialNumber ? "—" : <span className="font-medium text-[#0f172a]">×{item.quantity}</span>}
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-[#1e64c8] hover:bg-[#e8f0fc]"
                          title="Deploy to location"
                          onClick={() => setDeployItem(item)}
                        >
                          <ArrowRightFromLine className="h-3.5 w-3.5" />
                        </Button>
                        <StockItemFormDialog mode="edit" itemId={item.id} onSuccess={() => router.refresh()}>
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
                              <AlertDialogTitle>Delete stock item?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will remove &quot;{item.model}&quot; from stock. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(item.id)}
                                className="bg-[#ef4444] hover:bg-[#dc2626] text-white"
                              >
                                Delete
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
            <span>Rows per page</span>
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
          itemModel={deployItem.model}
          itemSerial={deployItem.serialNumber}
          availableQuantity={deployItem.quantity}
        />
      )}
    </div>
  );
}
