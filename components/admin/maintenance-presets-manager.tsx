"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Plus, Trash2, Wrench } from "lucide-react";
import { apiErrorMessage } from "@/lib/utils";
import { apiFetch, jsonBody } from "@/lib/api-client";

type Preset = {
  id: string;
  name: string;
  description: string | null;
};

export function MaintenancePresetsManager({ assetTypeId }: { assetTypeId: string }) {
  const t = useTranslations("assetTypes");
  const tCommon = useTranslations("common");
  const { toast } = useToast();
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
      toast({ title: tCommon("error"), description: apiErrorMessage(res.error, tCommon("somethingWentWrong")), variant: "destructive" });
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
      toast({ title: tCommon("error"), description: apiErrorMessage(res.error, tCommon("somethingWentWrong")), variant: "destructive" });
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
          Maintenance presets
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        Quick-pick task names for the work log when an asset of this type is selected (e.g. &quot;Clean filter&quot;, &quot;Replace lamp&quot;).
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading presets…
        </div>
      ) : (
        <>
          {presets.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No presets yet</p>
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
              Add preset
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
