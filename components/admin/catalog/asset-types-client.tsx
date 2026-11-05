"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Activity, ChevronDown, ChevronRight, Hash } from "lucide-react";
import { AssetDrilldownDialog } from "@/components/admin/catalog/asset-drilldown-dialog";
import { readMergeConflict, type MergeConflict } from "@/components/admin/catalog/merge-conflict";
import { MergeConfirmDialog } from "@/components/admin/catalog/merge-confirm-dialog";
import { useCatalogMerge } from "@/components/admin/catalog/use-catalog-merge";
import { apiFetch, jsonBody } from "@/lib/api-client";
import type { ManufacturerOption } from "@/components/inventory/use-type-scoped-manufacturers";
import { useApiErrorToast } from "@/components/ui/use-api-error-toast";
import { useServerList } from "@/components/admin/use-server-list";
import { AddNameRow } from "@/components/admin/catalog/add-name-row";
import { CatalogNameRow } from "@/components/admin/catalog/catalog-name-row";
import { AssetTypeConfigPanel, type AssetTypeConfig } from "@/components/admin/catalog/asset-type-config-panel";

type AssetType = AssetTypeConfig & {
  _count: { assets: number };
};

export function AssetTypesClient({
  initialTypes,
  manufacturers,
}: {
  initialTypes: AssetType[];
  manufacturers: ManufacturerOption[];
}) {
  const t = useTranslations("assetTypes");
  const { toast } = useToast();
  const showApiError = useApiErrorToast();
  const [types, applyChange] = useServerList(initialTypes);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Drilldown dialog — the asset type whose assets are listed
  const [drilldown, setDrilldown] = useState<{ name: string; url: string } | null>(null);

  function openDrilldown(item: { id: string; name: string }) {
    setDrilldown({ name: item.name, url: `/api/asset-types/${item.id}/assets` });
  }

  // Merge conflict dialog state
  const [mergeConflict, setMergeConflict] = useState<MergeConflict | null>(null);
  const catalogMerge = useCatalogMerge("asset-types");

  // Expand/collapse the scrape config per row
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  async function handleAdd() {
    if (!newName.trim()) return;
    setAdding(true);
    const res = await apiFetch<AssetType>("/api/asset-types", jsonBody("POST", { name: newName.trim() }));
    setAdding(false);
    if (!res.ok) {
      showApiError(res.error);
      return;
    }
    const item = res.data;
    applyChange((prev) =>
      [...prev, item].sort(
        (a, b) => a.name.localeCompare(b.name)
      )
    );
    setNewName("");
    toast({ title: t("typeCreated") });
  }

  /**
   * PUTs `patch` and merges the saved values of those fields into the list.
   * Errors are toasted unless `onError` handles them (returns true).
   */
  async function updateType(
    id: string,
    patch: Partial<AssetType>,
    onError?: (err: Parameters<typeof readMergeConflict>[0]) => boolean
  ): Promise<boolean> {
    const res = await apiFetch<AssetType>(`/api/asset-types/${id}`, jsonBody("PUT", patch));
    if (!res.ok) {
      if (!onError?.(res.error)) {
        showApiError(res.error);
      }
      return false;
    }
    const updated: AssetType = res.data;
    const saved = Object.fromEntries(Object.keys(patch).map((key) => [key, updated[key as keyof AssetType]]));
    applyChange((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...saved } : item)).sort((a, b) => a.name.localeCompare(b.name))
    );
    return true;
  }

  async function handleEditName(id: string, editName: string) {
    if (!editName.trim()) return;
    const newNameTrimmed = editName.trim();
    const saved = await updateType(id, { name: newNameTrimmed }, (err) => {
      const conflict = readMergeConflict(err, id, newNameTrimmed);
      if (conflict) setMergeConflict(conflict);
      return !!conflict;
    });
    if (!saved) return;
    setEditingId(null);
    toast({ title: t("typeUpdated") });
  }

  async function handleMerge() {
    if (!mergeConflict) return;
    const result = await catalogMerge.merge(mergeConflict.editingId, mergeConflict.existingId);
    setMergeConflict(null);
    if (!result) return;
    applyChange((prev) => prev.filter((x) => x.id !== mergeConflict.editingId));
    setEditingId(null);
    toast({ title: t("typeMerged"), description: catalogMerge.summary(result) });
  }

  async function handleDelete(id: string) {
    const res = await apiFetch(`/api/asset-types/${id}`, { method: "DELETE" });
    if (!res.ok) {
      showApiError(res.error);
      return;
    }
    applyChange((prev) => prev.filter((i) => i.id !== id));
    toast({ title: t("typeDeleted") });
  }

  return (
    <div className="space-y-4">
      <AddNameRow name={newName} onNameChange={setNewName} placeholder={t("namePlaceholder")} adding={adding} onAdd={handleAdd} />

      <div className="border rounded-lg divide-y">
        {types.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">{t("emptyList")}</div>
        ) : (
          types.map((item) => {
            const isExpanded = expandedIds.has(item.id);
            const hasTemplate = !!item.scrapeTargetTemplate?.trim();
            const isExcluded = !item.prometheusExposed;
            const hasHostnamePattern = !!item.hostnamePattern?.trim();

            return (
              <div key={item.id}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <CatalogNameRow
                    name={item.name}
                    assetCount={item._count.assets}
                    drilldownLabel={t("viewAssetsOfType", { count: item._count.assets, name: item.name })}
                    countLabel={`${item._count.assets} asset${item._count.assets !== 1 ? "s" : ""}`}
                    onDrilldown={() => openDrilldown(item)}
                    editing={editingId === item.id}
                    onStartRename={() => setEditingId(item.id)}
                    onCancelRename={() => setEditingId(null)}
                    onSaveRename={(name) => handleEditName(item.id, name)}
                    deleteTitle={t("deleteConfirmTitle")}
                    deleteDescription={item._count.assets > 0 ? t("typeInUse", { count: item._count.assets }) : t("deleteConfirmDescription")}
                    onDelete={() => handleDelete(item.id)}
                    badges={
                      <>
                        {hasTemplate && (
                          <Badge
                            variant="outline"
                            className="text-xs text-blue-600 border-blue-300 bg-blue-50 gap-1"
                          >
                            <Activity className="h-3 w-3" />
                            {t("scrapeConfigured")}
                          </Badge>
                        )}

                        {hasHostnamePattern && (
                          <Badge
                            variant="outline"
                            className="text-xs text-purple-600 border-purple-300 bg-purple-50 gap-1"
                          >
                            <Hash className="h-3 w-3" />
                            {t("hostnamePatternConfigured")}
                          </Badge>
                        )}

                        {isExcluded && (
                          <Badge
                            variant="outline"
                            className="text-xs text-amber-600 border-amber-300 bg-amber-50"
                          >
                            {t("prometheusExposedDisabled")}
                          </Badge>
                        )}
                      </>
                    }
                    extraActions={
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground"
                        aria-label={isExpanded ? `Hide scrape config for ${item.name}` : `Show scrape config for ${item.name}`}
                        aria-expanded={isExpanded}
                        onClick={() =>
                          setExpandedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(item.id)) { next.delete(item.id); } else { next.add(item.id); }
                            return next;
                          })
                        }
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    }
                  />
                </div>

                {isExpanded && (
                  <AssetTypeConfigPanel
                    type={item}
                    manufacturers={manufacturers}
                    onUpdate={(patch) => updateType(item.id, patch)}
                  />
                )}
              </div>
            );
          })
        )}
      </div>

      <AssetDrilldownDialog source={drilldown} column="manufacturer" onClose={() => setDrilldown(null)} />

      <MergeConfirmDialog
        open={!!mergeConflict}
        title={t("mergeConflictTitle")}
        description={t("mergeConflictDescription", {
          source: types.find((x) => x.id === mergeConflict?.editingId)?.name ?? "",
          target: mergeConflict?.existingName ?? "",
        })}
        cancelLabel={t("mergeConflictChangeName")}
        confirmLabel={t("mergeConflictMerge", { target: mergeConflict?.existingName ?? "" })}
        merging={catalogMerge.merging}
        destructive={false}
        onCancel={() => setMergeConflict(null)}
        onConfirm={handleMerge}
      />
    </div>
  );
}
