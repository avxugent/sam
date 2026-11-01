"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useToast } from "@/components/ui/use-toast";
import { Pencil, Trash2, Plus, Merge, TriangleAlert } from "lucide-react";
import type { MergeConflict } from "@/components/admin/catalog/merge-conflict";
import { MergeConfirmDialog } from "@/components/admin/catalog/merge-confirm-dialog";
import { useCatalogMerge } from "@/components/admin/catalog/use-catalog-merge";
import { ModelFormDialog, type ModelFields } from "@/components/admin/catalog/model-form-dialog";
import { ModelUsageDialog } from "@/components/admin/catalog/model-usage-dialog";
import { useServerList } from "@/components/admin/use-server-list";
import { apiFetch } from "@/lib/api-client";
import { useApiErrorToast } from "@/components/ui/use-api-error-toast";

type NameOption = { id: string; name: string };

type Model = ModelFields & {
  id: string;
  type: NameOption;
  manufacturer: NameOption | null;
  _count: { assets: number; stockItems: number };
};

type ClusterItem = { id: string; name: string; count: number; typeName: string; manufacturerName: string | null };

const ALL = "__all__";

export function ModelsClient({
  initialModels,
  assetTypes,
  manufacturers,
  initialClusters,
}: {
  initialModels: Model[];
  assetTypes: NameOption[];
  manufacturers: NameOption[];
  initialClusters: ClusterItem[][];
}) {
  const t = useTranslations("models");
  const tCommon = useTranslations("common");
  const { toast } = useToast();
  const showApiError = useApiErrorToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [models, applyChange] = useServerList(initialModels);
  const [clusters, setClusters] = useState(initialClusters);
  useEffect(() => { setClusters(initialClusters); }, [initialClusters]);

  const currentTypeId = searchParams.get("typeId") ?? "";
  const currentManufacturerId = searchParams.get("manufacturerId") ?? "";

  function setFilter(key: "typeId" | "manufacturerId", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== ALL) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  // The model in the create/edit dialog (id null for a new one); null when closed.
  const [form, setForm] = useState<(ModelFields & { id: string | null }) | null>(null);
  const [usageModel, setUsageModel] = useState<Model | null>(null);

  // Merge-on-409 dialog
  const [mergeConflict, setMergeConflict] = useState<MergeConflict | null>(null);
  const catalogMerge = useCatalogMerge("models");

  // Possible-duplicates merge dialog
  const [dupMerge, setDupMerge] = useState<{ sourceId: string; sourceName: string; targetId: string } | null>(null);

  function openCreate() {
    setForm({ id: null, typeId: currentTypeId, manufacturerId: currentManufacturerId || null, name: "", documentationUrl: null });
  }

  /** Removes a merged-away model from the list and from the duplicate clusters. */
  function dropMerged(sourceId: string) {
    applyChange((prev) => prev.filter((m) => m.id !== sourceId));
    setClusters((prev) => prev.map((c) => c.filter((i) => i.id !== sourceId)).filter((c) => c.length >= 2));
  }

  function handleSaved(saved: ModelFields & { id: string }) {
    const editing = form?.id ?? null;
    const visible =
      (!currentTypeId || saved.typeId === currentTypeId) &&
      (!currentManufacturerId || saved.manufacturerId === currentManufacturerId);
    applyChange((prev) => {
      if (!visible) return prev.filter((m) => m.id !== saved.id);
      const previous = prev.find((m) => m.id === saved.id);
      const row: Model = {
        id: saved.id,
        typeId: saved.typeId,
        manufacturerId: saved.manufacturerId,
        name: saved.name,
        documentationUrl: saved.documentationUrl,
        type: assetTypes.find((at) => at.id === saved.typeId) ?? { id: saved.typeId, name: "" },
        manufacturer: manufacturers.find((m) => m.id === saved.manufacturerId) ?? null,
        _count: previous?._count ?? { assets: 0, stockItems: 0 },
      };
      return previous ? prev.map((m) => (m.id === saved.id ? row : m)) : [...prev, row];
    });
    setForm(null);
    toast({ title: editing ? t("modelUpdated") : t("modelCreated") });
  }

  async function handleMergeConflict() {
    if (!mergeConflict) return;
    const result = await catalogMerge.merge(mergeConflict.editingId, mergeConflict.existingId);
    setMergeConflict(null);
    if (!result) return;
    dropMerged(mergeConflict.editingId);
    setForm(null);
    toast({ title: t("modelMerged"), description: catalogMerge.summary(result) });
  }

  async function handleDelete(id: string) {
    const res = await apiFetch(`/api/models/${id}`, { method: "DELETE" });
    if (!res.ok) {
      showApiError(res.error);
      return;
    }
    applyChange((prev) => prev.filter((m) => m.id !== id));
    toast({ title: t("modelDeleted") });
  }

  async function handleDuplicateMerge() {
    if (!dupMerge) return;
    const result = await catalogMerge.merge(dupMerge.sourceId, dupMerge.targetId);
    setDupMerge(null);
    if (!result) return;
    dropMerged(dupMerge.sourceId);
    toast({ title: t("modelMerged"), description: catalogMerge.summary(result) });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={currentTypeId || ALL} onValueChange={(v) => setFilter("typeId", v)}>
          <SelectTrigger className="h-8 w-48 text-[12.5px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("allTypes")}</SelectItem>
            {assetTypes.map((at) => (
              <SelectItem key={at.id} value={at.id}>{at.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={currentManufacturerId || ALL} onValueChange={(v) => setFilter("manufacturerId", v)}>
          <SelectTrigger className="h-8 w-48 text-[12.5px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("allManufacturers")}</SelectItem>
            {manufacturers.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" className="ml-auto" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          {t("addModel")}
        </Button>
      </div>

      <div className="border rounded-lg divide-y">
        {models.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">{t("noModelsYet")}</div>
        ) : (
          models.map((item) => {
            const usageCount = item._count.assets + item._count.stockItems;
            return (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => usageCount > 0 && setUsageModel(item)}
                      className="text-left text-sm font-medium truncate hover:text-primary transition-colors disabled:cursor-default"
                      disabled={usageCount === 0}
                    >
                      {item.name}
                    </button>
                    {!item.documentationUrl && (
                      <TriangleAlert
                        className="h-3.5 w-3.5 text-amber-600 flex-shrink-0"
                        aria-label={t("noDocumentationTooltip")}
                      >
                        <title>{t("noDocumentationTooltip")}</title>
                      </TriangleAlert>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {item.type.name}
                    {item.manufacturer && ` · ${item.manufacturer.name}`}
                  </div>
                </div>
                {usageCount > 0 && (
                  <Badge
                    variant="secondary"
                    className="text-xs cursor-pointer hover:bg-secondary/80 flex-shrink-0"
                    onClick={() => setUsageModel(item)}
                  >
                    {item._count.assets} / {item._count.stockItems}
                  </Badge>
                )}
                <Button size="icon" variant="ghost" className="h-8 w-8 flex-shrink-0" onClick={() => setForm(item)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8 flex-shrink-0 text-destructive hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {usageCount > 0
                          ? t("inUseDescription", { assets: item._count.assets, stockItems: item._count.stockItems })
                          : t("deleteConfirmDescription")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDelete(item.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        disabled={usageCount > 0}
                      >
                        {tCommon("delete")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            );
          })
        )}
      </div>

      {clusters.length > 0 && (
        <div className="space-y-3 border-t pt-6">
          <div>
            <h2 className="text-sm font-semibold">{t("possibleDuplicates")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t("possibleDuplicatesSubtitle")}</p>
          </div>
          <div className="space-y-2">
            {clusters.map((cluster) => (
              <div key={cluster.map((c) => c.id).join("|")} className="border rounded-lg p-3 flex items-center gap-3 flex-wrap">
                {cluster.map((item, i) => (
                  <div key={item.id} className="flex items-center gap-2">
                    {i > 0 && <Merge className="h-3.5 w-3.5 text-muted-foreground" />}
                    <span className="text-sm">
                      {item.name}
                      <span className="text-xs text-muted-foreground ml-1">
                        ({item.typeName}{item.manufacturerName ? ` / ${item.manufacturerName}` : ""})
                      </span>
                    </span>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto"
                  onClick={() => setDupMerge({ sourceId: cluster[1].id, sourceName: cluster[1].name, targetId: cluster[0].id })}
                >
                  {t("mergeButton")}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {form && (
        <ModelFormDialog
          initial={form}
          assetTypes={assetTypes}
          manufacturers={manufacturers}
          onClose={() => setForm(null)}
          onSaved={handleSaved}
          onMergeConflict={setMergeConflict}
        />
      )}

      <ModelUsageDialog model={usageModel} onClose={() => setUsageModel(null)} />

      {/* Merge-on-409 (rename collided with an existing model) */}
      <MergeConfirmDialog
        open={!!mergeConflict}
        title={t("mergeTitle")}
        description={t("mergeDescription", { from: models.find((m) => m.id === mergeConflict?.editingId)?.name ?? "" })}
        cancelLabel={tCommon("cancel")}
        confirmLabel={t("mergeSubmit")}
        merging={catalogMerge.merging}
        onCancel={() => setMergeConflict(null)}
        onConfirm={handleMergeConflict}
      />

      <MergeConfirmDialog
        open={!!dupMerge}
        title={t("mergeTitle")}
        description={t("mergeDescription", { from: dupMerge?.sourceName ?? "" })}
        cancelLabel={tCommon("cancel")}
        confirmLabel={t("mergeSubmit")}
        merging={catalogMerge.merging}
        onCancel={() => setDupMerge(null)}
        onConfirm={handleDuplicateMerge}
      />
    </div>
  );
}
