"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Pencil, Trash2, Plus, Tag } from "lucide-react";
import { validateTemplate } from "@/lib/scrape-template";
import { ScrapeTemplateFields } from "@/components/admin/scrape-template-fields";
import { apiErrorMessage } from "@/lib/utils";

type ManufacturerOption = { id: string; name: string };

type Override = {
  id: string;
  manufacturerId: string;
  manufacturerName: string;
  model: string;
  scrapeTargetTemplate: string;
};

export function ModelTemplateOverrides({
  assetTypeId,
  manufacturers,
}: {
  assetTypeId: string;
  manufacturers: ManufacturerOption[];
}) {
  const t = useTranslations("assetTypes");
  const tCommon = useTranslations("common");
  const { toast } = useToast();
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog state — editing === null means "creating a new override"
  const [editing, setEditing] = useState<Override | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedManufacturerId, setSelectedManufacturerId] = useState("");
  const [modelValue, setModelValue] = useState("");
  const [templateValue, setTemplateValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/asset-types/${assetTypeId}/model-templates`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setOverrides(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, [assetTypeId]);

  function openCreateDialog() {
    setEditing(null);
    setSelectedManufacturerId(manufacturers[0]?.id ?? "");
    setModelValue("");
    setTemplateValue("");
    setDialogOpen(true);
  }

  function openEditDialog(override: Override) {
    setEditing(override);
    setSelectedManufacturerId(override.manufacturerId);
    setModelValue(override.model);
    setTemplateValue(override.scrapeTargetTemplate);
    setDialogOpen(true);
  }

  async function handleSave() {
    const errors = validateTemplate(templateValue);
    if (errors.length > 0) {
      toast({ title: t("templateHasErrors"), description: errors[0], variant: "destructive" });
      return;
    }
    if (!editing && (!selectedManufacturerId || !modelValue.trim())) return;

    setSaving(true);
    const res = editing
      ? await fetch(`/api/asset-types/model-templates/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scrapeTargetTemplate: templateValue }),
        })
      : await fetch(`/api/asset-types/${assetTypeId}/model-templates`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            manufacturerId: selectedManufacturerId,
            model: modelValue.trim(),
            scrapeTargetTemplate: templateValue,
          }),
        });
    setSaving(false);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ title: tCommon("error"), description: apiErrorMessage(err), variant: "destructive" });
      return;
    }

    const saved: Override = await res.json();
    setOverrides((prev) =>
      editing
        ? prev.map((o) => (o.id === saved.id ? saved : o))
        : [...prev, saved].sort(
            (a, b) =>
              a.manufacturerName.localeCompare(b.manufacturerName) ||
              a.model.localeCompare(b.model)
          )
    );
    setDialogOpen(false);
    toast({ title: editing ? t("modelOverrideUpdated") : t("modelOverrideAdded") });
  }

  async function handleDelete(override: Override) {
    const res = await fetch(`/api/asset-types/model-templates/${override.id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ title: tCommon("error"), description: err.error, variant: "destructive" });
      return;
    }
    setOverrides((prev) => prev.filter((o) => o.id !== override.id));
    toast({ title: t("modelOverrideDeleted") });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Tag className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {t("modelOverrides")}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={manufacturers.length === 0}
          onClick={openCreateDialog}
        >
          <Plus className="h-3 w-3 mr-1" />
          {t("addOverride")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("modelOverridesHelp")}</p>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {tCommon("loading")}
        </div>
      ) : overrides.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">{t("noModelOverridesYet")}</p>
      ) : (
        <div className="space-y-1.5">
          {overrides.map((o) => (
            <div key={o.id} className="flex items-center gap-2 bg-background border rounded p-2">
              <span className="flex-1 text-sm font-medium truncate">
                {o.manufacturerName} — {o.model}
              </span>
              <Button
                size="icon"
                variant="ghost"
                aria-label={t("editOverrideFor", { name: `${o.manufacturerName} ${o.model}` })}
                className="h-7 w-7 text-muted-foreground hover:text-foreground flex-shrink-0"
                onClick={() => openEditDialog(o)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={t("deleteOverrideFor", { name: `${o.manufacturerName} ${o.model}` })}
                className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
                onClick={() => handleDelete(o)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t("modelOverrides")}
              {editing ? ` — ${editing.manufacturerName} / ${editing.model}` : ""}
            </DialogTitle>
          </DialogHeader>

          {!editing && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="override-manufacturer">
                  {t("selectManufacturer")}
                </label>
                <select
                  id="override-manufacturer"
                  value={selectedManufacturerId}
                  onChange={(e) => setSelectedManufacturerId(e.target.value)}
                  className="h-9 w-full px-2 rounded-md border border-input bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {manufacturers.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="override-model">
                  {t("model")}
                </label>
                <Input
                  id="override-model"
                  value={modelValue}
                  onChange={(e) => setModelValue(e.target.value)}
                  maxLength={255}
                />
              </div>
            </div>
          )}

          <ScrapeTemplateFields
            label={t("scrapeTemplate")}
            value={templateValue}
            onChange={setTemplateValue}
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                saving ||
                !templateValue.trim() ||
                (!editing && (!selectedManufacturerId || !modelValue.trim()))
              }
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {saving ? tCommon("saving") : tCommon("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
