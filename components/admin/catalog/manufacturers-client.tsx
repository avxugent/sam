"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/ui/use-toast";
import { AssetDrilldownDialog } from "@/components/admin/catalog/asset-drilldown-dialog";
import { readMergeConflict, type MergeConflict } from "@/components/admin/catalog/merge-conflict";
import { MergeConfirmDialog } from "@/components/admin/catalog/merge-confirm-dialog";
import { useCatalogMerge } from "@/components/admin/catalog/use-catalog-merge";
import { apiFetch, jsonBody } from "@/lib/api-client";
import { useApiErrorToast } from "@/components/ui/use-api-error-toast";
import { useServerList } from "@/components/admin/use-server-list";
import { AddNameRow } from "@/components/admin/add-name-row";
import { CatalogNameRow } from "@/components/admin/catalog/catalog-name-row";

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
  const [items, applyChange] = useServerList(initialManufacturers);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

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

  async function handleEdit(id: string, editName: string) {
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
    setMergeConflict(null);
    if (!result) return;
    applyChange((prev) => prev.filter((i) => i.id !== mergeConflict.editingId));
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
      <AddNameRow name={newName} onNameChange={setNewName} placeholder={t("addNewManufacturer")} adding={adding} onAdd={handleAdd} />

      <div className="border rounded-lg divide-y">
        {items.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">{t("emptyList")}</div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-3">
              <CatalogNameRow
                name={item.name}
                assetCount={item._count.assets}
                drilldownLabel={t("viewAssetsFrom", { count: item._count.assets, name: item.name })}
                countLabel={t("assetCount", { count: item._count.assets })}
                onDrilldown={() => openDrilldown(item)}
                editing={editingId === item.id}
                onStartRename={() => setEditingId(item.id)}
                onCancelRename={() => setEditingId(null)}
                onSaveRename={(name) => handleEdit(item.id, name)}
                deleteTitle={t("deleteNamedTitle", { name: item.name })}
                deleteDescription={item._count.assets > 0 ? t("inUseDescription", { count: item._count.assets }) : t("deleteConfirmDescription")}
                onDelete={() => handleDelete(item.id)}
              />
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
