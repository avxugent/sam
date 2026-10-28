"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Pencil, Trash2, Check, X, Plus, Activity, ChevronDown, ChevronRight, Info, Hash } from "lucide-react";
import { apiErrorMessage } from "@/lib/utils";
import { validateTemplate } from "@/lib/scrape-template";
import { validateHostnamePattern } from "@/lib/hostname/pattern";
import { MaintenancePresetsManager } from "@/components/admin/maintenance-presets-manager";
import { TemplateOverridesEditor } from "@/components/admin/template-overrides-editor";
import { ScrapeTemplateFields } from "@/components/admin/scrape-template-fields";
import { AssetDrilldownDialog } from "@/components/admin/asset-drilldown-dialog";

type AssetType = {
  id: string;
  name: string;
  scrapeTargetTemplate: string | null;
  prometheusExposed: boolean;
  hostnamePattern: string | null;
  defaultCriticality: string | null;
  _count: { assets: number };
};

type ManufacturerOption = { id: string; name: string };

const CRITICALITY_OPTIONS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export function AssetTypesClient({
  initialTypes,
  manufacturers,
}: {
  initialTypes: AssetType[];
  manufacturers: ManufacturerOption[];
}) {
  const t = useTranslations("assetTypes");
  const tCommon = useTranslations("common");
  const { toast } = useToast();
  const [types, setTypes] = useState(initialTypes);
  useEffect(() => { setTypes(initialTypes); }, [initialTypes]);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  // Drilldown dialog — the asset type whose assets are listed
  const [drilldown, setDrilldown] = useState<{ name: string; url: string } | null>(null);

  function openDrilldown(item: { id: string; name: string }) {
    setDrilldown({ name: item.name, url: `/api/asset-types/${item.id}/assets` });
  }

  // Merge conflict dialog state
  const [mergeConflict, setMergeConflict] = useState<{
    sourceId: string;
    sourceName: string;
    targetId: string;
    targetName: string;
  } | null>(null);
  const [merging, setMerging] = useState(false);

  // Template editor dialog state
  const [templateDialog, setTemplateDialog] = useState<AssetType | null>(null);
  const [templateValue, setTemplateValue] = useState("");
  const [templateSaving, setTemplateSaving] = useState(false);

  // Hostname pattern editor state — keyed by asset type id so multiple
  // expanded rows can be edited independently
  const [hostnamePatternDrafts, setHostnamePatternDrafts] = useState<Record<string, string>>({});
  const [hostnamePatternSavingId, setHostnamePatternSavingId] = useState<string | null>(null);

  // Expand/collapse the scrape config per row
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  async function handleAdd() {
    if (!newName.trim()) return;
    setAdding(true);
    const res = await fetch("/api/asset-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    setAdding(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ title: tCommon("error"), description: apiErrorMessage(err), variant: "destructive" });
      return;
    }
    const item = await res.json();
    setTypes((prev) =>
      [...prev, { ...item, scrapeTargetTemplate: null, prometheusExposed: true, hostnamePattern: null, defaultCriticality: null, _count: { assets: 0 } }].sort(
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
    onError?: (res: Response, err: { error?: string; conflict?: string; existingId?: string }) => boolean
  ): Promise<boolean> {
    const res = await fetch(`/api/asset-types/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (!onError?.(res, err)) {
        toast({ title: tCommon("error"), description: apiErrorMessage(err), variant: "destructive" });
      }
      return false;
    }
    const updated: AssetType = await res.json();
    const saved = Object.fromEntries(Object.keys(patch).map((key) => [key, updated[key as keyof AssetType]]));
    setTypes((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...saved } : item)).sort((a, b) => a.name.localeCompare(b.name))
    );
    return true;
  }

  async function handleEditName(id: string) {
    if (!editName.trim()) return;
    const newNameTrimmed = editName.trim();
    const saved = await updateType(id, { name: newNameTrimmed }, (res, err) => {
      if (res.status !== 409 || err.conflict !== "name" || !err.existingId) return false;
      const sourceName = types.find((x) => x.id === id)?.name ?? id;
      setMergeConflict({ sourceId: id, sourceName, targetId: err.existingId, targetName: newNameTrimmed });
      return true;
    });
    if (!saved) return;
    setEditingId(null);
    toast({ title: t("typeUpdated") });
  }

  async function handleMerge() {
    if (!mergeConflict) return;
    setMerging(true);
    const res = await fetch(`/api/asset-types/${mergeConflict.sourceId}/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetId: mergeConflict.targetId }),
    });
    setMerging(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ title: tCommon("error"), description: apiErrorMessage(err), variant: "destructive" });
      return;
    }
    setTypes((prev) => prev.filter((x) => x.id !== mergeConflict.sourceId));
    setMergeConflict(null);
    setEditingId(null);
    toast({ title: t("typeMerged") });
  }

  async function handleSaveTemplate() {
    if (!templateDialog) return;
    const errors = validateTemplate(templateValue);
    if (errors.length > 0) {
      toast({
        title: t("templateHasErrors"),
        description: errors[0],
        variant: "destructive",
      });
      return;
    }
    setTemplateSaving(true);
    const saved = await updateType(templateDialog.id, { scrapeTargetTemplate: templateValue.trim() || null });
    setTemplateSaving(false);
    if (!saved) return;
    setTemplateDialog(null);
    toast({ title: t("scrapeTemplateSaved") });
  }

  async function handleSaveHostnamePattern(id: string) {
    const value = (hostnamePatternDrafts[id] ?? "").trim();
    if (value) {
      const patternError = validateHostnamePattern(value);
      if (patternError) {
        toast({ title: t("hostnamePatternInvalid"), description: patternError, variant: "destructive" });
        return;
      }
    }
    setHostnamePatternSavingId(id);
    const saved = await updateType(id, { hostnamePattern: value || null });
    setHostnamePatternSavingId(null);
    if (!saved) return;
    setHostnamePatternDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    toast({ title: t("hostnamePatternSaved") });
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/asset-types/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ title: tCommon("error"), description: apiErrorMessage(err), variant: "destructive" });
      return;
    }
    setTypes((prev) => prev.filter((i) => i.id !== id));
    toast({ title: t("typeDeleted") });
  }

  async function handleSaveDefaultCriticality(id: string, value: string) {
    if (!(await updateType(id, { defaultCriticality: value || null }))) return;
    toast({ title: t("defaultCriticalitySaved") });
  }

  async function handleTogglePrometheusExposed(id: string, current: boolean) {
    await updateType(id, { prometheusExposed: !current });
  }

  return (
    <div className="space-y-4">
      {/* Add form */}
      <div className="flex gap-2">
        <Input
          placeholder={t("namePlaceholder")}
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

      {/* List */}
      <div className="border rounded-lg divide-y">
        {types.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No asset types yet</div>
        ) : (
          types.map((item) => {
            const isExpanded = expandedIds.has(item.id);
            const hasTemplate = !!item.scrapeTargetTemplate?.trim();
            const isExcluded = !item.prometheusExposed;
            const hasHostnamePattern = !!item.hostnamePattern?.trim();

            return (
              <div key={item.id}>
                {/* Main row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  {editingId === item.id ? (
                    <>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleEditName(item.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="max-w-xs h-8"
                        autoFocus
                      />
                      <Button size="icon" variant="ghost" aria-label={tCommon("saveName")} className="h-8 w-8" onClick={() => handleEditName(item.id)}>
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
                          aria-label={t("viewAssetsOfType", { count: item._count.assets, name: item.name })}
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
                          {item._count.assets} asset{item._count.assets !== 1 ? "s" : ""}
                        </Badge>
                      )}

                      {hasTemplate && (
                        <Badge
                          variant="outline"
                          className="text-xs text-blue-600 border-blue-300 bg-blue-50 gap-1"
                        >
                          <Activity className="h-3 w-3" />
                          Scrape configured
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

                      {/* Expand/collapse scrape config */}
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
                            <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {item._count.assets > 0
                                ? t("typeInUse", { count: item._count.assets })
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

                {/* Expandable scrape config panel */}
                {isExpanded && (
                  <div className="px-4 pb-4 bg-muted/30 border-t">
                    {/* Prometheus SD toggle */}
                    <div className="pt-3 pb-3 border-b">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id={`prometheus-exposed-${item.id}`}
                          checked={item.prometheusExposed}
                          onCheckedChange={() => handleTogglePrometheusExposed(item.id, item.prometheusExposed)}
                        />
                        <div className="space-y-0.5">
                          <label
                            htmlFor={`prometheus-exposed-${item.id}`}
                            className="text-sm font-medium cursor-pointer"
                          >
                            {t("prometheusExposed")}
                          </label>
                          <p className="text-xs text-muted-foreground">{t("prometheusExposedHelp")}</p>
                        </div>
                      </div>
                    </div>

                    {/* Default criticality */}
                    <div className="pt-3 pb-3 border-b space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {t("defaultCriticality")}
                      </p>
                      <p className="text-xs text-muted-foreground">{t("defaultCriticalityHelp")}</p>
                      <select
                        aria-label={t("defaultCriticality")}
                        value={item.defaultCriticality ?? ""}
                        onChange={(e) => handleSaveDefaultCriticality(item.id, e.target.value)}
                        className="h-8 px-2 rounded-md border border-input bg-transparent text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="">{t("defaultCriticalityNone")}</option>
                        {CRITICALITY_OPTIONS.map((level) => (
                          <option key={level} value={level}>{tCommon(`criticality.${level}`)}</option>
                        ))}
                      </select>
                    </div>

                    {/* Hostname format (regex) */}
                    <div className="pt-3 pb-3 border-b space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <Hash className="h-3.5 w-3.5" />
                        {t("hostnamePattern")}
                      </p>
                      <p className="text-xs text-muted-foreground">{t("hostnamePatternHelp")}</p>
                      <div className="flex gap-2 items-start">
                        <div className="flex-1">
                          <Input
                            value={hostnamePatternDrafts[item.id] ?? item.hostnamePattern ?? ""}
                            onChange={(e) =>
                              setHostnamePatternDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                            }
                            placeholder={t("hostnamePatternPlaceholder")}
                            className="font-mono text-xs"
                          />
                          {(() => {
                            const draft = (hostnamePatternDrafts[item.id] ?? item.hostnamePattern ?? "").trim();
                            if (!draft) return null;
                            const patternError = validateHostnamePattern(draft);
                            return patternError ? (
                              <p className="text-xs text-destructive mt-1">{patternError}</p>
                            ) : (
                              <p className="text-xs text-green-700 mt-1">{t("hostnamePatternValid")}</p>
                            );
                          })()}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs flex-shrink-0"
                          disabled={hostnamePatternSavingId === item.id || hostnamePatternDrafts[item.id] === undefined}
                          onClick={() => handleSaveHostnamePattern(item.id)}
                        >
                          {hostnamePatternSavingId === item.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            tCommon("save")
                          )}
                        </Button>
                      </div>
                    </div>

                    <div className="pt-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                          <Activity className="h-3.5 w-3.5" />
                          {t("scrapeTemplate")}
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => {
                            setTemplateDialog(item);
                            setTemplateValue(item.scrapeTargetTemplate ?? "");
                          }}
                        >
                          <Pencil className="h-3 w-3 mr-1" />
                          {tCommon("edit")}
                        </Button>
                      </div>

                      {hasTemplate ? (
                        <pre className="text-xs font-mono bg-background border rounded p-3 overflow-x-auto whitespace-pre-wrap">
                          {item.scrapeTargetTemplate}
                        </pre>
                      ) : (
                        <div className="flex items-start gap-2 text-xs text-muted-foreground py-2">
                          <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                          <span>
                            {t("scrapeTemplateHelp")}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="pt-4 mt-4 border-t">
                      <TemplateOverridesEditor
                        kind="manufacturer"
                        assetTypeId={item.id}
                        manufacturers={manufacturers}
                      />
                    </div>

                    <div className="pt-4 mt-4 border-t">
                      <TemplateOverridesEditor
                        kind="model"
                        assetTypeId={item.id}
                        manufacturers={manufacturers}
                      />
                    </div>

                    <div className="pt-4 mt-4 border-t">
                      <MaintenancePresetsManager assetTypeId={item.id} />
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Asset drilldown dialog */}
      <AssetDrilldownDialog source={drilldown} column="manufacturer" onClose={() => setDrilldown(null)} />

      {/* Template editor dialog */}
      <Dialog
        open={!!templateDialog}
        onOpenChange={(open) => { if (!open) setTemplateDialog(null); }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t("scrapeTemplate")} — {templateDialog?.name}
            </DialogTitle>
          </DialogHeader>

          <ScrapeTemplateFields
            label={t("scrapeTemplate")}
            value={templateValue}
            onChange={setTemplateValue}
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialog(null)}>
              {tCommon("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setTemplateValue("");
              }}
              className="mr-auto"
            >
              {tCommon("delete")}
            </Button>
            <Button onClick={handleSaveTemplate} disabled={templateSaving}>
              {templateSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {templateSaving ? tCommon("saving") : tCommon("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge conflict dialog */}
      <AlertDialog open={!!mergeConflict} onOpenChange={(open) => { if (!open) setMergeConflict(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("mergeConflictTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("mergeConflictDescription", {
                source: mergeConflict?.sourceName ?? "",
                target: mergeConflict?.targetName ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setMergeConflict(null)}>
              {t("mergeConflictChangeName")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleMerge}
              disabled={merging}
              className="bg-[#1e64c8] hover:bg-[#1a56b0] text-white"
            >
              {merging && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("mergeConflictMerge", { target: mergeConflict?.targetName ?? "" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
