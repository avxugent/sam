"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Plus, Trash2, Wrench } from "lucide-react";
import { apiFetch, jsonBody } from "@/lib/api-client";
import { useApiErrorToast } from "@/components/ui/use-api-error-toast";

type Preset = {
  id: string;
  name: string;
  description: string | null;
};

export function MaintenancePresetsManager({ assetTypeId }: { assetTypeId: string }) {
  const t = useTranslations("assetTypes");
  const { toast } = useToast();
  const showApiError = useApiErrorToast();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiFetch<Preset[]>(`/api/asset-types/${assetTypeId}/presets`).then((res) => {
      setPresets(res.ok ? res.data : []);
      setLoading(false);
    });
  }, [assetTypeId]);

  async function handleAdd() {
    if (!newName.trim()) return;
    setAdding(true);
    const res = await apiFetch<Preset>(`/api/asset-types/${assetTypeId}/presets`, jsonBody("POST", { name: newName.trim(), description: newDesc.trim() || null }));
    setAdding(false);
    if (!res.ok) {
      showApiError(res.error);
      return;
    }
    const created = res.data;
    setPresets((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    setNewName("");
    setNewDesc("");
    toast({ title: t("presetAdded") });
  }

  async function handleDelete(id: string) {
    const res = await apiFetch(`/api/asset-types/presets/${id}`, { method: "DELETE" });
    if (!res.ok) {
      showApiError(res.error);
      return;
    }
    setPresets((prev) => prev.filter((p) => p.id !== id));
    toast({ title: t("presetDeleted") });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {t("maintenancePresets")}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("presetsHelp")}
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t("loadingPresets")}
        </div>
      ) : (
        <>
          {presets.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">{t("noPresets")}</p>
          ) : (
            <div className="space-y-1.5">
              {presets.map((p) => (
                <div key={p.id} className="flex items-start gap-2 bg-background border rounded p-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{p.name}</p>
                    {p.description && (
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap mt-0.5">
                        {p.description}
                      </p>
                    )}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t("deletePresetNamed", { name: p.name })}
                    className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
                    onClick={() => handleDelete(p.id)}
                    title={t("deletePreset")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1.5 pt-2 border-t">
            <Input
              placeholder={t("newPresetPlaceholder")}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-8 text-sm"
            />
            <Textarea
              placeholder={t("presetDescPlaceholder")}
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              rows={2}
              className="text-sm"
            />
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={adding || !newName.trim()}
              className="h-8 gap-1"
            >
              {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              {t("addPreset")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
