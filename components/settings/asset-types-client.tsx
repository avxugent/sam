"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import Link from "next/link";
import {
  Loader2,
  Pencil,
  Trash2,
  Check,
  X,
  Plus,
  Activity,
  ChevronDown,
  ChevronRight,
  Info,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { getUsedVariables, validateTemplate } from "@/lib/scrape-template";
import { MaintenancePresetsManager } from "@/components/settings/maintenance-presets-manager";

type AssetType = {
  id: string;
  name: string;
  scrapeTargetTemplate: string | null;
  prometheusExposed: boolean;
  _count: { assets: number };
};

type DrilldownAsset = {
  id: string;
  model?: string | null;
  serialNumber?: string | null;
  hostname?: string | null;
  installationDate?: string | null;
  location: { id: string; name: string } | null;
  manufacturer: { name: string } | null;
};

const TEMPLATE_PLACEHOLDER = `# Lines starting with # are comments.
# Format: key=value (one per line)
# Available variables: {hostname_fqdn}, {serial}, {model}, {manufacturer}, {fi_number}
# Vault variables:     {vault_<key>}  (key name from the Vault secret)

# Pearl recorder exporter example:
# __address__=https://pearlexporterdev.ugent.be
# __metrics_path__=/probe
# __param_target__=https://{hostname_fqdn}
# __param_user__={vault_username}
# __param_password__={vault_password}`;

function TemplatePreview({ template }: { template: string }) {
  if (!template.trim()) return null;
  const errors = validateTemplate(template);
  const { standard, vault } = getUsedVariables(template);

  return (
    <div className="space-y-2 mt-2">
      {errors.length > 0 && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 space-y-1">
          {errors.map((e, i) => (
            <p key={i} className="text-xs text-destructive flex items-start gap-1.5">
              <X className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              {e}
            </p>
          ))}
        </div>
      )}
      {errors.length === 0 && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 flex items-start gap-2">
          <Check className="h-3.5 w-3.5 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-green-700">Template syntax is valid</p>
        </div>
      )}
      {(standard.length > 0 || vault.length > 0) && (
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {standard.map((v) => (
            <code key={v} className="bg-muted px-1.5 py-0.5 rounded">
              {"{" + v + "}"}
            </code>
          ))}
          {vault.map((v) => (
            <code key={v} className="bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded">
              {"{vault_" + v + "}"}
            </code>
          ))}
        </div>
      )}
    </div>
  );
}

export function AssetTypesClient({ initialTypes }: { initialTypes: AssetType[] }) {
  const t = useTranslations("assetTypes");
  const tCommon = useTranslations("common");
  const { toast } = useToast();
  const [types, setTypes] = useState(initialTypes);
  useEffect(() => { setTypes(initialTypes); }, [initialTypes]);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  // Drilldown dialog state
  const [drilldownType, setDrilldownType] = useState<AssetType | null>(null);
  const [drilldownAssets, setDrilldownAssets] = useState<DrilldownAsset[]>([]);
  const [drilldownLoading, setDrilldownLoading] = useState(false);

  async function openDrilldown(item: AssetType) {
    setDrilldownType(item);
    setDrilldownAssets([]);
    setDrilldownLoading(true);
    const res = await fetch(`/api/asset-types/${item.id}/assets`);
    setDrilldownLoading(false);
    if (res.ok) {
      setDrilldownAssets(await res.json());
    }
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
      const err = await res.json();
      toast({ title: tCommon("error"), description: err.error, variant: "destructive" });
      return;
    }
    const item = await res.json();
    setTypes((prev) =>
      [...prev, { ...item, scrapeTargetTemplate: null, prometheusExposed: true, _count: { assets: 0 } }].sort(
        (a, b) => a.name.localeCompare(b.name)
      )
    );
    setNewName("");
    toast({ title: t("typeCreated") });
  }

  async function handleEditName(id: string) {
    if (!editName.trim()) return;
    const newNameTrimmed = editName.trim();
    const res = await fetch(`/api/asset-types/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newNameTrimmed }),
    });
    if (!res.ok) {
      const err = await res.json();
      if (res.status === 409 && err.conflict === "name" && err.existingId) {
        const sourceName = types.find((x) => x.id === id)?.name ?? id;
        setMergeConflict({ sourceId: id, sourceName, targetId: err.existingId, targetName: newNameTrimmed });
        return;
      }
      toast({ title: tCommon("error"), description: err.error, variant: "destructive" });
      return;
    }
    const updated = await res.json();
    setTypes((prev) =>
      prev
        .map((i) => (i.id === id ? { ...i, name: updated.name } : i))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
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
      const err = await res.json();
      toast({ title: tCommon("error"), description: err.error, variant: "destructive" });
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
    const res = await fetch(`/api/asset-types/${templateDialog.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scrapeTargetTemplate: templateValue.trim() || null,
      }),
    });
    setTemplateSaving(false);
    if (!res.ok) {
      const err = await res.json();
      toast({ title: tCommon("error"), description: err.error || err.details?.[0], variant: "destructive" });
      return;
    }
    const updated = await res.json();
    setTypes((prev) =>
      prev.map((item) =>
        item.id === templateDialog.id
          ? { ...item, scrapeTargetTemplate: updated.scrapeTargetTemplate }
          : item
      )
    );
    setTemplateDialog(null);
    toast({ title: t("scrapeTemplateSaved") });
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/asset-types/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json();
      toast({ title: tCommon("error"), description: err.error, variant: "destructive" });
      return;
    }
    setTypes((prev) => prev.filter((i) => i.id !== id));
    toast({ title: t("typeDeleted") });
  }

  async function handleTogglePrometheusExposed(id: string, current: boolean) {
    const res = await fetch(`/api/asset-types/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prometheusExposed: !current }),
    });
    if (!res.ok) {
      const err = await res.json();
      toast({ title: tCommon("error"), description: err.error, variant: "destructive" });
      return;
    }
    setTypes((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, prometheusExposed: !current } : item
      )
    );
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
                      <Button size="icon" variant="ghost" aria-label="Save name" className="h-8 w-8" onClick={() => handleEditName(item.id)}>
                        <Check className="h-4 w-4 text-green-600" />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Cancel rename" className="h-8 w-8" onClick={() => setEditingId(null)}>
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
                          aria-label={`View ${item._count.assets} asset${item._count.assets !== 1 ? "s" : ""} of type ${item.name}`}
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
                        aria-label={`Rename ${item.name}`}
                        className="h-8 w-8"
                        onClick={() => { setEditingId(item.id); setEditName(item.name); }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" aria-label={`Delete ${item.name}`} className="h-8 w-8 text-destructive hover:text-destructive">
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
      <Dialog
        open={!!drilldownType}
        onOpenChange={(open) => { if (!open) setDrilldownType(null); }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {drilldownType?.name}
              {!drilldownLoading && (
                <span className="font-normal text-muted-foreground ml-2">
                  — {drilldownAssets.length} asset{drilldownAssets.length !== 1 ? "s" : ""}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {drilldownLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-auto max-h-[60vh]">
              <table className="w-full text-sm">
                <caption className="sr-only">{drilldownType?.name}</caption>
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th scope="col" className="text-left px-3 py-2 font-medium text-muted-foreground">Location</th>
                    <th scope="col" className="text-left px-3 py-2 font-medium text-muted-foreground">Manufacturer</th>
                    <th scope="col" className="text-left px-3 py-2 font-medium text-muted-foreground">Model</th>
                    <th scope="col" className="text-left px-3 py-2 font-medium text-muted-foreground">Serial #</th>
                    <th scope="col" className="text-left px-3 py-2 font-medium text-muted-foreground">Hostname</th>
                    <th scope="col" className="text-left px-3 py-2 font-medium text-muted-foreground">Installed</th>
                  </tr>
                </thead>
                <tbody>
                  {drilldownAssets.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-muted-foreground">No assets found</td>
                    </tr>
                  ) : (
                    drilldownAssets.map((asset, i) => (
                      <tr
                        key={asset.id}
                        className={`border-b last:border-0 hover:bg-muted/30 ${i % 2 !== 0 ? "bg-muted/10" : ""}`}
                      >
                        <td className="px-3 py-2">
                          {asset.location ? (
                            <Link href={`/locations/${asset.location.id}`} className="hover:text-primary">
                              {asset.location.name}
                            </Link>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{asset.manufacturer?.name || "—"}</td>
                        <td className="px-3 py-2 font-medium">{asset.model || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{asset.serialNumber || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{asset.hostname || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">{formatDate(asset.installationDate)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>

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

          <div className="space-y-4">
            {/* Help box */}
            <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1.5">
              <p className="font-semibold text-foreground">Template format</p>
              <p>One <code className="bg-muted px-1 rounded">key=value</code> pair per line. Keys become Prometheus <code className="bg-muted px-1 rounded">__labels__</code>.</p>
              <p className="font-medium text-foreground mt-1">Available variables:</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                {[
                  ["{hostname_fqdn}", "Asset hostname as stored"],
                  ["{serial}", "Serial number"],
                  ["{model}", "Model"],
                  ["{manufacturer}", "Manufacturer"],
                  ["{fi_number}", "FI number (14.10.100.013)"],
                  ["{vault_<key>}", "Value from Vault secret"],
                ].map(([v, desc]) => (
                  <div key={v} className="flex items-baseline gap-1.5">
                    <code className="text-blue-700 bg-blue-50 px-1 rounded shrink-0">{v}</code>
                    <span>{desc}</span>
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-xs">
                <span className="font-medium text-foreground">Pearl example:</span>{" "}
                <code className="bg-muted px-1 rounded">__address__=https://pearlexporter.example.com</code>{" "}
                <code className="bg-muted px-1 rounded">__metrics_path__=/probe</code>{" "}
                <code className="bg-muted px-1 rounded">__param_target__=https://&#123;hostname_fqdn&#125;</code>
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>{t("scrapeTemplate")}</Label>
              <Textarea
                value={templateValue}
                onChange={(e) => setTemplateValue(e.target.value)}
                placeholder={TEMPLATE_PLACEHOLDER}
                rows={10}
                className="font-mono text-xs"
                spellCheck={false}
              />
              <TemplatePreview template={templateValue} />
            </div>
          </div>

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
