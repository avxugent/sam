"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Loader2, Pencil, Trash2, Plus, Merge, TriangleAlert } from "lucide-react";
import type { AssetStatus } from "@/generated/prisma/enums";
import { apiErrorMessage } from "@/lib/utils";

type NameOption = { id: string; name: string };

type Model = {
  id: string;
  name: string;
  typeId: string;
  manufacturerId: string | null;
  documentationUrl: string | null;
  type: NameOption;
  manufacturer: NameOption | null;
  _count: { assets: number; stockItems: number };
};

type ClusterItem = { id: string; model: string; count: number; typeName: string; manufacturerName: string | null };

type DrilldownAsset = { id: string; serialNumber: string | null; hostname: string | null; status: AssetStatus; location: { id: string; name: string } | null };
type DrilldownStockItem = { id: string; serialNumber: string | null; quantity: number; location: { id: string; name: string } | null };

type MergeConflict = {
  editingId: string;
  newTypeId: string;
  newManufacturerId: string | null;
  newName: string;
  existingId: string;
  existingName: string;
  existingAssetCount: number;
  existingStockCount: number;
};

const ALL = "__all__";
const NONE = "__none__";

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [models, setModels] = useState(initialModels);
  useEffect(() => { setModels(initialModels); }, [initialModels]);
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

  // Create/edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTypeId, setFormTypeId] = useState("");
  const [formManufacturerId, setFormManufacturerId] = useState("");
  const [formName, setFormName] = useState("");
  const [formDocumentationUrl, setFormDocumentationUrl] = useState("");
  const [saving, setSaving] = useState(false);

  // Usage drilldown
  const [drilldownItem, setDrilldownItem] = useState<Model | null>(null);
  const [drilldownAssets, setDrilldownAssets] = useState<DrilldownAsset[]>([]);
  const [drilldownStock, setDrilldownStock] = useState<DrilldownStockItem[]>([]);
  const [drilldownLoading, setDrilldownLoading] = useState(false);

  // Merge-on-409 dialog
  const [mergeConflict, setMergeConflict] = useState<MergeConflict | null>(null);
  const [merging, setMerging] = useState(false);

  // Possible-duplicates merge dialog
  const [dupMerge, setDupMerge] = useState<{ sourceId: string; sourceName: string; targetId: string } | null>(null);
  const [dupMerging, setDupMerging] = useState(false);

  function openCreate() {
    setEditingId(null);
    setFormTypeId(currentTypeId || "");
    setFormManufacturerId(currentManufacturerId || "");
    setFormName("");
    setFormDocumentationUrl("");
    setDialogOpen(true);
  }

  function openEdit(item: Model) {
    setEditingId(item.id);
    setFormTypeId(item.typeId);
    setFormManufacturerId(item.manufacturerId ?? "");
    setFormName(item.name);
    setFormDocumentationUrl(item.documentationUrl ?? "");
    setDialogOpen(true);
  }

  async function openDrilldown(item: Model) {
    setDrilldownItem(item);
    setDrilldownAssets([]);
    setDrilldownStock([]);
    setDrilldownLoading(true);
    const res = await fetch(`/api/models/${item.id}/usage`);
    setDrilldownLoading(false);
    if (res.ok) {
      const data = await res.json();
      setDrilldownAssets(data.assets);
      setDrilldownStock(data.stockItems);
    }
  }

  async function handleSave() {
    if (!formTypeId || !formName.trim()) return;
    setSaving(true);
    const payload = {
      typeId: formTypeId,
      manufacturerId: formManufacturerId || null,
      name: formName.trim(),
      documentationUrl: formDocumentationUrl.trim() || null,
    };
    const res = editingId
      ? await fetch(`/api/models/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
    setSaving(false);

    if (res.status === 409) {
      const err = await res.json().catch(() => ({}));
      if (editingId) {
        setMergeConflict({
          editingId,
          newTypeId: formTypeId,
          newManufacturerId: formManufacturerId || null,
          newName: formName.trim(),
          existingId: err.existingId,
          existingName: err.existingName,
          existingAssetCount: err.existingAssetCount ?? 0,
          existingStockCount: err.existingStockCount ?? 0,
        });
      } else {
        toast({ title: tCommon("error"), description: err.error, variant: "destructive" });
      }
      return;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ title: tCommon("error"), description: apiErrorMessage(err), variant: "destructive" });
      return;
    }

    router.refresh();
    setDialogOpen(false);
    toast({ title: editingId ? t("modelUpdated") : t("modelCreated") });
  }

  async function handleMergeConflict() {
    if (!mergeConflict) return;
    setMerging(true);
    const res = await fetch(`/api/models/${mergeConflict.editingId}/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetId: mergeConflict.existingId }),
    });
    setMerging(false);
    const data = await res.json();
    if (!res.ok) {
      toast({ title: tCommon("error"), description: data.error, variant: "destructive" });
      setMergeConflict(null);
      return;
    }
    setMergeConflict(null);
    setDialogOpen(false);
    router.refresh();
    toast({
      title: t("modelMerged"),
      description: `${data.assetsMoved} asset(s), ${data.stockItemsMoved} stock item(s) moved to "${mergeConflict.existingName}".`,
    });
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/models/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ title: tCommon("error"), description: apiErrorMessage(err), variant: "destructive" });
      return;
    }
    setModels((prev) => prev.filter((m) => m.id !== id));
    toast({ title: t("modelDeleted") });
  }

  async function handleDuplicateMerge() {
    if (!dupMerge) return;
    setDupMerging(true);
    const res = await fetch(`/api/models/${dupMerge.sourceId}/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetId: dupMerge.targetId }),
    });
    setDupMerging(false);
    const data = await res.json();
    if (!res.ok) {
      toast({ title: tCommon("error"), description: data.error, variant: "destructive" });
      setDupMerge(null);
      return;
    }
    setDupMerge(null);
    router.refresh();
    toast({
      title: t("modelMerged"),
      description: `${data.assetsMoved} asset(s), ${data.stockItemsMoved} stock item(s) moved.`,
    });
  }

  return (
    <div className="space-y-6">
      {/* Filters + add */}
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

      {/* List */}
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
                      onClick={() => usageCount > 0 && openDrilldown(item)}
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
                    onClick={() => openDrilldown(item)}
                  >
                    {item._count.assets} / {item._count.stockItems}
                  </Badge>
                )}
                <Button size="icon" variant="ghost" className="h-8 w-8 flex-shrink-0" onClick={() => openEdit(item)}>
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
                          ? `This model is used by ${item._count.assets} asset(s) and ${item._count.stockItems} stock item(s). Reassign or merge them first.`
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

      {/* Possible duplicates */}
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
                      {item.model}
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
                  onClick={() => setDupMerge({ sourceId: cluster[1].id, sourceName: cluster[1].model, targetId: cluster[0].id })}
                >
                  {t("mergeButton")}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create/edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? t("editModel") : t("newModel")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Select value={formTypeId} onValueChange={setFormTypeId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectType")} />
                </SelectTrigger>
                <SelectContent>
                  {assetTypes.map((at) => (
                    <SelectItem key={at.id} value={at.id}>{at.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Select value={formManufacturerId || NONE} onValueChange={(v) => setFormManufacturerId(v === NONE ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder={t("selectManufacturer")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t("noManufacturer")}</SelectItem>
                  {manufacturers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder={t("namePlaceholder")}
            />
            <div className="space-y-1">
              <Input
                type="url"
                value={formDocumentationUrl}
                onChange={(e) => setFormDocumentationUrl(e.target.value)}
                placeholder={t("documentationUrlPlaceholder")}
              />
              <p className="text-xs text-muted-foreground">{t("documentationRequiredHint")}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{tCommon("cancel")}</Button>
            <Button onClick={handleSave} disabled={saving || !formTypeId || !formName.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tCommon("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Usage drilldown dialog */}
      <Dialog open={!!drilldownItem} onOpenChange={(open) => { if (!open) setDrilldownItem(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{drilldownItem?.name}</DialogTitle>
          </DialogHeader>
          {drilldownLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4 overflow-auto max-h-[60vh]">
              {drilldownAssets.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-1">Assets ({drilldownAssets.length})</h3>
                  <ul className="text-sm divide-y border rounded">
                    {drilldownAssets.map((a) => (
                      <li key={a.id} className="px-3 py-1.5 flex justify-between">
                        <span>{a.serialNumber || a.hostname || a.id}</span>
                        <span className="text-muted-foreground">{a.location?.name ?? "—"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {drilldownStock.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-1">Stock ({drilldownStock.length})</h3>
                  <ul className="text-sm divide-y border rounded">
                    {drilldownStock.map((s) => (
                      <li key={s.id} className="px-3 py-1.5 flex justify-between">
                        <span>{s.serialNumber || `×${s.quantity}`}</span>
                        <span className="text-muted-foreground">{s.location?.name ?? "—"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Merge-on-409 dialog (rename collided with an existing model) */}
      <AlertDialog open={!!mergeConflict} onOpenChange={(open) => { if (!open) setMergeConflict(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("mergeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("mergeDescription", { from: mergeConflict?.existingName ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setMergeConflict(null)}>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleMergeConflict}
              disabled={merging}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {merging && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("mergeSubmit")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Possible-duplicates merge confirmation */}
      <AlertDialog open={!!dupMerge} onOpenChange={(open) => { if (!open) setDupMerge(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("mergeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("mergeDescription", { from: dupMerge?.sourceName ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDupMerge(null)}>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDuplicateMerge}
              disabled={dupMerging}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {dupMerging && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("mergeSubmit")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
