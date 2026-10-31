"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Pencil, Trash2, Check, X, Plus } from "lucide-react";
import { AssetDrilldownDialog } from "@/components/admin/catalog/asset-drilldown-dialog";
import { readMergeConflict, type MergeConflict } from "@/components/admin/catalog/merge-conflict";
import { MergeConfirmDialog } from "@/components/admin/catalog/merge-confirm-dialog";
import { useCatalogMerge } from "@/components/admin/catalog/use-catalog-merge";
import { apiFetch, jsonBody } from "@/lib/api-client";
import { useApiErrorToast } from "@/components/ui/use-api-error-toast";

type Manufacturer = {
  id: string;
  name: string;
  _count: { assets: number };
};

export function ManufacturersClient({
  initialManufacturers,
}: {
  initialManufacturers: Manufacturer[];
}) {
  const t = useTranslations("manufacturers");
  const tCommon = useTranslations("common");
  const { toast } = useToast();
  const showApiError = useApiErrorToast();
  const router = useRouter();
  const [items, setItems] = useState(initialManufacturers);
  useEffect(() => { setItems(initialManufacturers); }, [initialManufacturers]);
  /** Shows a successful change at once, then reloads the server data (counts and other derived values) behind it. */
  function applyChange(update: (current: typeof items) => typeof items) {
    setItems(update);
    router.refresh();
  }
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  // Drilldown dialog — the catalog entry whose assets are listed
  const [drilldown, setDrilldown] = useState<{ name: string; url: string } | null>(null);

  // Merge conflict AlertDialog (programmatically controlled)
  const [mergeConflict, setMergeConflict] = useState<MergeConflict | null>(null);
  const catalogMerge = useCatalogMerge("manufacturers");

  function openDrilldown(item: { id: string; name: string }) {
    setDrilldown({ name: item.name, url: `/api/manufacturers/${item.id}/assets` });
  }

  async function handleAdd() {
    if (!newName.trim()) return;
    setAdding(true);
    const res = await apiFetch<Manufacturer>("/api/manufacturers", jsonBody("POST", { name: newName.trim() }));
    setAdding(false);
    if (!res.ok) {
      showApiError(res.error);
      return;
    }
    const item = res.data;
    applyChange((prev) =>
      [...prev, item].sort((a, b) => a.name.localeCompare(b.name))
    );
    setNewName("");
    toast({ title: t("manufacturerCreated") });
  }

  async function handleEdit(id: string) {
    if (!editName.trim()) return;
    const res = await apiFetch<Manufacturer>(`/api/manufacturers/${id}`, jsonBody("PUT", { name: editName.trim() }));

    if (!res.ok) {
      const conflict = readMergeConflict(res.error, id, editName.trim());
      if (conflict) {
        setMergeConflict(conflict);
        return;
      }
      showApiError(res.error);
      return;
    }
    const updated = res.data;
    applyChange((prev) =>
      prev
        .map((i) => (i.id === id ? { ...i, name: updated.name } : i))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
    setEditingId(null);
    toast({ title: t("manufacturerUpdated") });
  }

  async function handleMerge() {
    if (!mergeConflict) return;
    const result = await catalogMerge.merge(mergeConflict.editingId, mergeConflict.existingId);
    if (!result) {
      setMergeConflict(null);
      return;
    }
    applyChange((prev) => prev.filter((i) => i.id !== mergeConflict.editingId));
    setMergeConflict(null);
    setEditingId(null);
    toast({ title: t("manufacturerMerged"), description: catalogMerge.summary(result) });
  }

  async function handleDelete(id: string) {
    const res = await apiFetch(`/api/manufacturers/${id}`, { method: "DELETE" });
    if (!res.ok) {
      showApiError(res.error);
      return;
    }
    applyChange((prev) => prev.filter((i) => i.id !== id));
    toast({ title: t("manufacturerDeleted") });
  }

  return (
    <div className="space-y-4">
      {/* Add form */}
      <div className="flex gap-2">
        <Input
          placeholder={t("addNewManufacturer")}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          className="max-w-sm"
        />
        <Button onClick={handleAdd} disabled={adding || !newName.trim()}>
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {tCommon("add")}
        </Button>
      </div>

      <div className="border rounded-lg divide-y">
        {items.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">{t("emptyList")}</div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-3">
              {editingId === item.id ? (
                <>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleEdit(item.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="max-w-xs h-8"
                    autoFocus
                  />
                  <Button size="icon" variant="ghost" aria-label={tCommon("saveName")} className="h-8 w-8" onClick={() => handleEdit(item.id)}>
                    <Check className="h-4 w-4 text-green-600" />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label={tCommon("cancelRename")} className="h-8 w-8" onClick={() => setEditingId(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  {item._count.assets > 0 ? (
                    <button
                      type="button"
                      onClick={() => openDrilldown(item)}
                      className="flex-1 text-left text-sm font-medium cursor-pointer hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                      aria-label={t("viewAssetsFrom", { count: item._count.assets, name: item.name })}
                    >
                      {item.name}
                    </button>
                  ) : (
                    <span className="flex-1 text-sm font-medium">{item.name}</span>
                  )}
                  {item._count.assets > 0 && (
                    <Badge
                      variant="secondary"
                      className="text-xs cursor-pointer hover:bg-secondary/80"
                      onClick={() => openDrilldown(item)}
                      aria-hidden="true"
                    >
                      {t("assetCount", { count: item._count.assets })}
                    </Badge>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={tCommon("renameItem", { name: item.name })}
                    className="h-8 w-8"
                    onClick={() => { setEditingId(item.id); setEditName(item.name); }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost" aria-label={tCommon("deleteItem", { name: item.name })} className="h-8 w-8 text-destructive hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("deleteNamedTitle", { name: item.name })}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {item._count.assets > 0
                            ? t("inUseDescription", { count: item._count.assets })
                            : t("deleteConfirmDescription")}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(item.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          disabled={item._count.assets > 0}
                        >
                          {tCommon("delete")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
            </div>
          ))
        )}
      </div>

      <AssetDrilldownDialog source={drilldown} column="type" onClose={() => setDrilldown(null)} />

      <MergeConfirmDialog
        open={!!mergeConflict}
        title={t("mergeTitle")}
        description={t("mergeDescription", { from: items.find((i) => i.id === mergeConflict?.editingId)?.name ?? "" })}
        cancelLabel={tCommon("cancel")}
        confirmLabel={t("mergeSubmit")}
        merging={catalogMerge.merging}
        onCancel={() => setMergeConflict(null)}
        onConfirm={handleMerge}
      />
    </div>
  );
}
