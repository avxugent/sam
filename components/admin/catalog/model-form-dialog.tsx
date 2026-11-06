"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SELECT_NONE } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { readMergeConflict, type MergeConflict } from "@/components/admin/catalog/merge-conflict";
import { apiFetch, jsonBody } from "@/lib/api-client";
import { useApiErrorToast } from "@/components/ui/use-api-error-toast";

type NameOption = { id: string; name: string };

/** A model's own columns, as the form edits them and the API returns them. */
export type ModelFields = {
  typeId: string;
  manufacturerId: string | null;
  name: string;
  documentationUrl: string | null;
};

/**
 * Create (`initial.id` null) or edit a model. Mount it to open it; it calls
 * `onClose` on cancel, `onSaved` with the saved model, and `onMergeConflict`
 * when a rename collides with an existing model (the dialog stays open).
 */
export function ModelFormDialog({
  initial,
  assetTypes,
  manufacturers,
  onClose,
  onSaved,
  onMergeConflict,
}: {
  initial: ModelFields & { id: string | null };
  assetTypes: NameOption[];
  manufacturers: NameOption[];
  onClose: () => void;
  onSaved: (saved: ModelFields & { id: string }) => void;
  onMergeConflict: (conflict: MergeConflict) => void;
}) {
  const t = useTranslations("models");
  const tCommon = useTranslations("common");
  const showApiError = useApiErrorToast();
  const [typeId, setTypeId] = useState(initial.typeId);
  const [manufacturerId, setManufacturerId] = useState(initial.manufacturerId ?? "");
  const [name, setName] = useState(initial.name);
  const [documentationUrl, setDocumentationUrl] = useState(initial.documentationUrl ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!typeId || !name.trim()) return;
    setSaving(true);
    const payload = {
      typeId,
      manufacturerId: manufacturerId || null,
      name: name.trim(),
      documentationUrl: documentationUrl.trim() || null,
    };
    const res = initial.id
      ? await apiFetch<ModelFields & { id: string }>(`/api/models/${initial.id}`, jsonBody("PUT", payload))
      : await apiFetch<ModelFields & { id: string }>("/api/models", jsonBody("POST", payload));
    setSaving(false);

    if (!res.ok) {
      const conflict = initial.id ? readMergeConflict(res.error, initial.id, payload.name) : null;
      if (conflict) onMergeConflict(conflict);
      else showApiError(res.error);
      return;
    }
    onSaved(res.data);
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial.id ? t("editModel") : t("newModel")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Select value={typeId} onValueChange={(v) => v && setTypeId(v)}>
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
            <Select
              value={manufacturerId || SELECT_NONE}
              onValueChange={(v) => v && setManufacturerId(v === SELECT_NONE ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("selectManufacturer")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SELECT_NONE}>{t("noManufacturer")}</SelectItem>
                {manufacturers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("namePlaceholder")}
          />
          <div className="space-y-1">
            <Input
              type="url"
              value={documentationUrl}
              onChange={(e) => setDocumentationUrl(e.target.value)}
              placeholder={t("documentationUrlPlaceholder")}
            />
            <p className="text-xs text-muted-foreground">{t("documentationRequiredHint")}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tCommon("cancel")}</Button>
          <Button onClick={handleSave} disabled={saving || !typeId || !name.trim()} aria-busy={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
