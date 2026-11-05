"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Pencil, Activity, Info, Hash } from "lucide-react";
import { validateTemplate } from "@/lib/prometheus/scrape-template";
import { validateHostnamePattern } from "@/lib/hostname";
import { MaintenancePresetsManager } from "@/components/admin/catalog/maintenance-presets-manager";
import { TemplateOverridesEditor } from "@/components/admin/catalog/template-overrides-editor";
import { ScrapeTemplateFields } from "@/components/admin/catalog/scrape-template-fields";
import type { Criticality } from "@/generated/prisma/enums";
import { CRITICALITY_VALUES, parseCriticality } from "@/lib/criticality";
import type { ManufacturerOption } from "@/components/inventory/use-type-scoped-manufacturers";

export type AssetTypeConfig = {
  id: string;
  name: string;
  scrapeTargetTemplate: string | null;
  prometheusExposed: boolean;
  hostnamePattern: string | null;
  defaultCriticality: Criticality | null;
};

/**
 * The expanded configuration of one asset type: Prometheus exposure, default criticality,
 * hostname pattern, scrape template, template overrides and maintenance presets.
 * `onUpdate` PUTs a patch of the type and resolves to whether it was saved (failures are toasted by it).
 */
export function AssetTypeConfigPanel({
  type,
  manufacturers,
  onUpdate,
}: {
  type: AssetTypeConfig;
  manufacturers: ManufacturerOption[];
  onUpdate: (patch: Partial<AssetTypeConfig>) => Promise<boolean>;
}) {
  const t = useTranslations("assetTypes");
  const tCommon = useTranslations("common");
  const { toast } = useToast();

  // null = untouched; the input shows the saved pattern
  const [patternDraft, setPatternDraft] = useState<string | null>(null);
  const [patternSaving, setPatternSaving] = useState(false);

  // null = template dialog closed
  const [templateDraft, setTemplateDraft] = useState<string | null>(null);
  const [templateSaving, setTemplateSaving] = useState(false);

  const hasTemplate = !!type.scrapeTargetTemplate?.trim();
  const shownPattern = patternDraft ?? type.hostnamePattern ?? "";

  async function handleSaveHostnamePattern() {
    const value = shownPattern.trim();
    if (value) {
      const patternError = validateHostnamePattern(value);
      if (patternError) {
        toast({ title: t("hostnamePatternInvalid"), description: patternError, variant: "destructive" });
        return;
      }
    }
    setPatternSaving(true);
    const saved = await onUpdate({ hostnamePattern: value || null });
    setPatternSaving(false);
    if (!saved) return;
    setPatternDraft(null);
    toast({ title: t("hostnamePatternSaved") });
  }

  async function handleSaveTemplate() {
    if (templateDraft === null) return;
    const errors = validateTemplate(templateDraft);
    if (errors.length > 0) {
      toast({ title: t("templateHasErrors"), description: errors[0], variant: "destructive" });
      return;
    }
    setTemplateSaving(true);
    const saved = await onUpdate({ scrapeTargetTemplate: templateDraft.trim() || null });
    setTemplateSaving(false);
    if (!saved) return;
    setTemplateDraft(null);
    toast({ title: t("scrapeTemplateSaved") });
  }

  async function handleSaveDefaultCriticality(value: string) {
    if (!(await onUpdate({ defaultCriticality: parseCriticality(value) }))) return;
    toast({ title: t("defaultCriticalitySaved") });
  }

  const patternError = shownPattern.trim() ? validateHostnamePattern(shownPattern.trim()) : null;

  return (
    <div className="px-4 pb-4 bg-muted/30 border-t">
      <div className="pt-3 pb-3 border-b">
        <div className="flex items-start gap-3">
          <Checkbox
            id={`prometheus-exposed-${type.id}`}
            checked={type.prometheusExposed}
            onCheckedChange={() => onUpdate({ prometheusExposed: !type.prometheusExposed })}
          />
          <div className="space-y-0.5">
            <label
              htmlFor={`prometheus-exposed-${type.id}`}
              className="text-sm font-medium cursor-pointer"
            >
              {t("prometheusExposed")}
            </label>
            <p className="text-xs text-muted-foreground">{t("prometheusExposedHelp")}</p>
          </div>
        </div>
      </div>

      <div className="pt-3 pb-3 border-b space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {t("defaultCriticality")}
        </p>
        <p className="text-xs text-muted-foreground">{t("defaultCriticalityHelp")}</p>
        <select
          aria-label={t("defaultCriticality")}
          value={type.defaultCriticality ?? ""}
          onChange={(e) => handleSaveDefaultCriticality(e.target.value)}
          className="h-8 px-2 rounded-md border border-input bg-transparent text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">{t("defaultCriticalityNone")}</option>
          {CRITICALITY_VALUES.map((level) => (
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
              value={shownPattern}
              onChange={(e) => setPatternDraft(e.target.value)}
              placeholder={t("hostnamePatternPlaceholder")}
              className="font-mono text-xs"
            />
            {shownPattern.trim() && (
              patternError ? (
                <p className="text-xs text-destructive mt-1">{patternError}</p>
              ) : (
                <p className="text-xs text-green-700 mt-1">{t("hostnamePatternValid")}</p>
              )
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs flex-shrink-0"
            disabled={patternSaving || patternDraft === null}
            onClick={handleSaveHostnamePattern}
          >
            {patternSaving ? (
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
            onClick={() => setTemplateDraft(type.scrapeTargetTemplate ?? "")}
          >
            <Pencil className="h-3 w-3 mr-1" />
            {tCommon("edit")}
          </Button>
        </div>

        {hasTemplate ? (
          <pre className="text-xs font-mono bg-background border rounded p-3 overflow-x-auto whitespace-pre-wrap">
            {type.scrapeTargetTemplate}
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
          assetTypeId={type.id}
          manufacturers={manufacturers}
        />
      </div>

      <div className="pt-4 mt-4 border-t">
        <TemplateOverridesEditor
          kind="model"
          assetTypeId={type.id}
          manufacturers={manufacturers}
        />
      </div>

      <div className="pt-4 mt-4 border-t">
        <MaintenancePresetsManager assetTypeId={type.id} />
      </div>

      <Dialog
        open={templateDraft !== null}
        onOpenChange={(open) => { if (!open) setTemplateDraft(null); }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t("scrapeTemplate")} — {type.name}
            </DialogTitle>
          </DialogHeader>

          <ScrapeTemplateFields
            label={t("scrapeTemplate")}
            value={templateDraft ?? ""}
            onChange={setTemplateDraft}
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDraft(null)}>
              {tCommon("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => setTemplateDraft("")}
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
    </div>
  );
}
