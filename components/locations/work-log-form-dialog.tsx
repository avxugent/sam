"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useTranslations } from "next-intl";
import { createWorkLogSchema } from "@/lib/schemas/work-log";
import { z } from "zod";

type WorkLogFormValues = z.infer<typeof createWorkLogSchema>;

export type WorkLogAssetOption = {
  id: string;
  label: string;
  typeId: string | null;
};

export type WorkLogUserOption = {
  id: string;
  label: string;
};

export type WorkLogItemOption = {
  id: string;
  name: string;
  description: string | null;
};

type Preset = { id: string; name: string; description: string | null };

type Props = {
  mode: "create" | "edit";
  locationId: string;
  workLogId?: string;
  initialData?: {
    assetId?: string | null;
    itemId?: string | null;
    performedById?: string;
    performedAt?: string;
    description?: string;
    jiraIssueKey?: string | null;
  };
  assets: WorkLogAssetOption[];
  users: WorkLogUserOption[];
  items: WorkLogItemOption[];
  currentUserId: string;
  children: React.ReactNode;
  onSuccess?: () => void;
};

const NO_ASSET = "__none__";
const NO_ITEM = "__none__";

function todayIsoDate(): string {
  return new Date().toISOString().split("T")[0];
}

export function WorkLogFormDialog({
  mode,
  locationId,
  workLogId,
  initialData,
  assets,
  users,
  items,
  currentUserId,
  children,
  onSuccess,
}: Props) {
  const t = useTranslations("workLog");
  const tCommon = useTranslations("common");
  const tField = useTranslations("field");

  const JIRA_KEY_REGEX = /^[A-Z][A-Z0-9_]+-\d+$/;
  const validationSchema = useMemo(() => z.object({
    assetId: z.string().min(1).optional().nullable(),
    itemId: z.string().min(1).optional().nullable(),
    performedById: z.string().min(1).optional(),
    performedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, t("errDateFormat")).optional(),
    description: z.string().max(5000).optional().nullable(),
    jiraIssueKey: z.string().regex(JIRA_KEY_REGEX, t("errJiraKeyFormat")).optional().nullable().or(z.literal("")),
  }).superRefine((data, ctx) => {
    if (!data.itemId && !data.description?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["description"], message: t("errDescriptionRequired") });
    }
  }), [t]);

  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<WorkLogFormValues>({
    resolver: zodResolver(validationSchema),
    defaultValues: {
      assetId: initialData?.assetId ?? null,
      itemId: initialData?.itemId ?? null,
      performedById: initialData?.performedById ?? currentUserId,
      performedAt: initialData?.performedAt ?? todayIsoDate(),
      description: initialData?.description ?? "",
      jiraIssueKey: initialData?.jiraIssueKey ?? "",
    },
  });

  // eslint-disable-next-line react-hooks/incompatible-library
  const assetIdValue = watch("assetId");
  const itemIdValue = watch("itemId");
  const descriptionValue = watch("description");

  // Fetch presets when an asset (with a type) is selected
  useEffect(() => {
    if (!assetIdValue) {
      setPresets([]);
      return;
    }
    const asset = assets.find((a) => a.id === assetIdValue);
    if (!asset?.typeId) {
      setPresets([]);
      return;
    }
    setPresetsLoading(true);
    fetch(`/api/asset-types/${asset.typeId}/presets`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setPresets(Array.isArray(data) ? data : []))
      .finally(() => setPresetsLoading(false));
  }, [assetIdValue, assets]);

  function applyPreset(preset: Preset) {
    const current = descriptionValue?.trim() ?? "";
    const presetText = preset.description ? `${preset.name}\n\n${preset.description}` : preset.name;
    const next = current ? `${current}\n\n${presetText}` : presetText;
    setValue("description", next, { shouldValidate: true });
  }

  async function onSubmit(data: WorkLogFormValues) {
    const url =
      mode === "create"
        ? `/api/locations/${locationId}/work-logs`
        : `/api/work-logs/${workLogId}`;
    const method = mode === "create" ? "POST" : "PUT";

    const payload = {
      ...data,
      assetId: data.assetId === NO_ASSET ? null : data.assetId || null,
      itemId: data.itemId === NO_ITEM ? null : data.itemId || null,
      // Send null (not "") so an item-only entry passes the API's non-empty
      // description rule.
      description: data.description?.trim() ? data.description : null,
      jiraIssueKey: data.jiraIssueKey ? data.jiraIssueKey : null,
    };

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({
        title: tCommon("error"),
        description: err.error || tCommon("somethingWentWrong"),
        variant: "destructive",
      });
      return;
    }

    toast({ title: mode === "create" ? t("entryCreated") : t("entryUpdated") });
    setOpen(false);
    reset();
    router.refresh();
    onSuccess?.();
  }

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (v) {
      reset({
        assetId: initialData?.assetId ?? null,
        itemId: initialData?.itemId ?? null,
        performedById: initialData?.performedById ?? currentUserId,
        performedAt: initialData?.performedAt ?? todayIsoDate(),
        description: initialData?.description ?? "",
        jiraIssueKey: initialData?.jiraIssueKey ?? "",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? t("addEntry") : t("editEntry")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Asset (optional) */}
          <div className="space-y-1.5">
            <Label htmlFor="wl-asset">{t("asset")} <span className="text-xs text-muted-foreground">({tCommon("optional")})</span></Label>
            <Select
              value={assetIdValue ?? NO_ASSET}
              onValueChange={(v) => setValue("assetId", v === NO_ASSET ? null : v, { shouldValidate: true })}
            >
              <SelectTrigger id="wl-asset">
                <SelectValue placeholder={t("noSpecificAsset")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ASSET}>— {t("noAsset")} —</SelectItem>
                {assets.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Work log item (optional) */}
          {items.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="wl-item">{t("item")} <span className="text-xs text-muted-foreground">({tCommon("optional")})</span></Label>
              <Select
                value={itemIdValue ?? NO_ITEM}
                onValueChange={(v) => setValue("itemId", v === NO_ITEM ? null : v, { shouldValidate: true })}
              >
                <SelectTrigger id="wl-item">
                  <SelectValue placeholder={t("noItem")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ITEM}>— {t("noItem")} —</SelectItem>
                  {items.map((it) => (
                    <SelectItem key={it.id} value={it.id}>{it.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Date + performed-by */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="wl-date">
                {t("date")} <span aria-hidden="true" className="text-destructive">*</span>
              </Label>
              <Input
                id="wl-date"
                type="date"
                aria-required="true"
                aria-invalid={!!errors.performedAt}
                aria-describedby={errors.performedAt ? "wl-date-err" : undefined}
                {...register("performedAt")}
              />
              {errors.performedAt && (
                <p id="wl-date-err" className="text-xs text-destructive">{errors.performedAt.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wl-user">
                {t("performedBy")} <span aria-hidden="true" className="text-destructive">*</span>
              </Label>
              <Select
                value={watch("performedById") ?? currentUserId}
                onValueChange={(v) => setValue("performedById", v, { shouldValidate: true })}
              >
                <SelectTrigger id="wl-user" aria-required="true">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Preset chips */}
          {presets.length > 0 && (
            <div className="rounded-md border bg-muted/30 p-2.5 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                <Sparkles className="h-3 w-3" />
                {t("quickPresets")}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {presets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className="px-2.5 py-1 text-[12px] rounded-full bg-white border border-[#e2e8f0] text-[#334155] hover:border-[#1e64c8] hover:text-[#1e64c8] transition-colors"
                    title={p.description ?? p.name}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {presetsLoading && (
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t("loadingPresets")}
            </p>
          )}

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="wl-desc">
              {tField("description")}{" "}
              {itemIdValue ? (
                <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
              ) : (
                <span aria-hidden="true" className="text-destructive">*</span>
              )}
            </Label>
            <Textarea
              id="wl-desc"
              aria-required="true"
              aria-invalid={!!errors.description}
              aria-describedby={errors.description ? "wl-desc-err" : undefined}
              {...register("description")}
              placeholder={t("descriptionPlaceholder")}
              rows={4}
            />
            {errors.description && (
              <p id="wl-desc-err" className="text-xs text-destructive">{errors.description.message}</p>
            )}
          </div>

          {/* JIRA key (optional) */}
          <div className="space-y-1.5">
            <Label htmlFor="wl-jira">
              {t("jiraIssueKey")} <span className="text-xs text-muted-foreground">({tCommon("optional")})</span>
            </Label>
            <Input
              id="wl-jira"
              aria-invalid={!!errors.jiraIssueKey}
              aria-describedby={errors.jiraIssueKey ? "wl-jira-err" : undefined}
              {...register("jiraIssueKey")}
              placeholder="AVT-123"
              className="font-mono"
            />
            {errors.jiraIssueKey && (
              <p id="wl-jira-err" className="text-xs text-destructive">{errors.jiraIssueKey.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting} className="gap-1.5">
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {mode === "create" ? t("addEntry") : tCommon("saveChanges")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
