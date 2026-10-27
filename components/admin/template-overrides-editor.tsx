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
import { Loader2, Pencil, Trash2, Plus, Tag, Tags } from "lucide-react";
import { validateTemplate } from "@/lib/scrape-template";
import { ScrapeTemplateFields } from "@/components/admin/scrape-template-fields";
import { apiErrorMessage } from "@/lib/utils";
import type { TemplateOverride } from "@/lib/template-overrides";

type ManufacturerOption = { id: string; name: string };
type Kind = "manufacturer" | "model";

/** Per-kind API path segment, icon and translation keys (namespace "assetTypes"). */
const KINDS = {
  manufacturer: {
    path: "manufacturer-templates",
    Icon: Tags,
    keys: {
      title: "manufacturerOverrides",
      help: "manufacturerOverridesHelp",
      empty: "noOverridesYet",
      added: "overrideAdded",
      updated: "overrideUpdated",
      deleted: "overrideDeleted",
    },
  },
  model: {
    path: "model-templates",
    Icon: Tag,
    keys: {
      title: "modelOverrides",
      help: "modelOverridesHelp",
      empty: "noModelOverridesYet",
      added: "modelOverrideAdded",
      updated: "modelOverrideUpdated",
      deleted: "modelOverrideDeleted",
    },
  },
} as const;

function overrideLabel(o: Pick<TemplateOverride, "manufacturerName" | "model">, separator: string) {
  return o.model ? `${o.manufacturerName}${separator}${o.model}` : o.manufacturerName;
}

/**
 * Lists and edits an asset type's scrape template overrides — per manufacturer,
 * or per manufacturer + model.
 */
export function TemplateOverridesEditor({
  kind,
  assetTypeId,
  manufacturers,
}: {
  kind: Kind;
  assetTypeId: string;
  manufacturers: ManufacturerOption[];
}) {
  const t = useTranslations("assetTypes");
  const tCommon = useTranslations("common");
  const { toast } = useToast();
  const { path, Icon, keys } = KINDS[kind];
  const withModel = kind === "model";

  const [overrides, setOverrides] = useState<TemplateOverride[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog state — editing === null means "creating a new override"
  const [editing, setEditing] = useState<TemplateOverride | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedManufacturerId, setSelectedManufacturerId] = useState("");
  const [modelValue, setModelValue] = useState("");
  const [templateValue, setTemplateValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/asset-types/${assetTypeId}/${path}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setOverrides(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, [assetTypeId, path]);

  // A manufacturer can have one manufacturer-level override; model overrides allow many.
  const availableManufacturers = withModel
    ? manufacturers
    : manufacturers.filter((m) => !overrides.some((o) => o.manufacturerId === m.id));

  function openCreateDialog() {
    setEditing(null);
    setSelectedManufacturerId(availableManufacturers[0]?.id ?? "");
    setModelValue("");
    setTemplateValue("");
    setDialogOpen(true);
  }

  function openEditDialog(override: TemplateOverride) {
    setEditing(override);
    setSelectedManufacturerId(override.manufacturerId);
    setModelValue(override.model ?? "");
    setTemplateValue(override.scrapeTargetTemplate);
    setDialogOpen(true);
  }

  const missingCreateFields = !selectedManufacturerId || (withModel && !modelValue.trim());

  async function handleSave() {
    const errors = validateTemplate(templateValue);
    if (errors.length > 0) {
      toast({ title: t("templateHasErrors"), description: errors[0], variant: "destructive" });
      return;
    }
    if (!editing && missingCreateFields) return;

    setSaving(true);
    const res = editing
      ? await fetch(`/api/asset-types/${path}/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scrapeTargetTemplate: templateValue }),
        })
      : await fetch(`/api/asset-types/${assetTypeId}/${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            manufacturerId: selectedManufacturerId,
            ...(withModel && { model: modelValue.trim() }),
            scrapeTargetTemplate: templateValue,
          }),
        });
    setSaving(false);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ title: tCommon("error"), description: apiErrorMessage(err), variant: "destructive" });
      return;
    }

    const saved: TemplateOverride = await res.json();
    setOverrides((prev) =>
      editing
        ? prev.map((o) => (o.id === saved.id ? saved : o))
        : [...prev, saved].sort(
            (a, b) =>
              a.manufacturerName.localeCompare(b.manufacturerName) || (a.model ?? "").localeCompare(b.model ?? "")
          )
    );
    setDialogOpen(false);
    toast({ title: editing ? t(keys.updated) : t(keys.added) });
  }

  async function handleDelete(override: TemplateOverride) {
    const res = await fetch(`/api/asset-types/${path}/${override.id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ title: tCommon("error"), description: apiErrorMessage(err), variant: "destructive" });
      return;
    }
    setOverrides((prev) => prev.filter((o) => o.id !== override.id));
    toast({ title: t(keys.deleted) });
  }

  const manufacturerSelect = (
    <div className="space-y-1.5">
      <label className="text-sm font-medium" htmlFor={`${kind}-override-manufacturer`}>
        {t("selectManufacturer")}
      </label>
      <select
        id={`${kind}-override-manufacturer`}
        value={selectedManufacturerId}
        onChange={(e) => setSelectedManufacturerId(e.target.value)}
        className="h-9 w-full px-2 rounded-md border border-input bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        {availableManufacturers.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t(keys.title)}</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={availableManufacturers.length === 0}
          onClick={openCreateDialog}
        >
          <Plus className="h-3 w-3 mr-1" />
          {t("addOverride")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t(keys.help)}</p>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {tCommon("loading")}
        </div>
      ) : overrides.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">{t(keys.empty)}</p>
      ) : (
        <div className="space-y-1.5">
          {overrides.map((o) => (
            <div key={o.id} className="flex items-center gap-2 bg-background border rounded p-2">
              <span className="flex-1 text-sm font-medium truncate">{overrideLabel(o, " — ")}</span>
              <Button
                size="icon"
                variant="ghost"
                aria-label={t("editOverrideFor", { name: overrideLabel(o, " ") })}
                className="h-7 w-7 text-muted-foreground hover:text-foreground flex-shrink-0"
                onClick={() => openEditDialog(o)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={t("deleteOverrideFor", { name: overrideLabel(o, " ") })}
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
              {t(keys.title)}
              {editing ? ` — ${overrideLabel(editing, " / ")}` : ""}
            </DialogTitle>
          </DialogHeader>

          {!editing &&
            (withModel ? (
              <div className="grid grid-cols-2 gap-3">
                {manufacturerSelect}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="model-override-model">
                    {t("model")}
                  </label>
                  <Input
                    id="model-override-model"
                    value={modelValue}
                    onChange={(e) => setModelValue(e.target.value)}
                    maxLength={255}
                  />
                </div>
              </div>
            ) : (
              manufacturerSelect
            ))}

          <ScrapeTemplateFields label={t("scrapeTemplate")} value={templateValue} onChange={setTemplateValue} />

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={handleSave} disabled={saving || !templateValue.trim() || (!editing && missingCreateFields)}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {saving ? tCommon("saving") : tCommon("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
