"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Hash } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useTranslations } from "next-intl";
import { FI_NUMBER_REGEX } from "@/lib/schemas/location";
import { parseFiNumber } from "@/lib/locations/tree";
import { apiFetch, jsonBody } from "@/lib/api-client";
import { useApiErrorToast } from "@/components/ui/use-api-error-toast";

type LocationFormTranslator = ReturnType<typeof useTranslations<"locationForm">>;

/** Client mirror of lib/schemas/location.ts with translated messages. */
function buildLocationFormSchema(t: LocationFormTranslator) {
  return z.object({
    name: z.string().min(1, t("errNameRequired")).max(255),
    description: z.string().max(2000).optional(),
    fiNumber: z.string().regex(FI_NUMBER_REGEX, t("errFiNumberFormat")).optional().or(z.literal("")),
    address: z.string().max(500).optional(),
    city: z.string().max(255).optional(),
    country: z.string().max(100).optional(),
  });
}

type LocationFormValues = z.infer<ReturnType<typeof buildLocationFormSchema>>;

/**
 * Auto-inserts dots as the user types: 14 → 14. → 14.10 → 14.10. → ...
 * Strips anything that isn't a digit or dot, then rebuilds canonical form.
 */
function autoFormatFiNumber(raw: string): string {
  // Keep only digits
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return "";

  // Segment lengths: 2, 2, 3, 3
  const segments = [
    digits.slice(0, 2),
    digits.slice(2, 4),
    digits.slice(4, 7),
    digits.slice(7, 10),
  ].filter(Boolean);

  return segments.join(".");
}

type Props = {
  mode: "create" | "edit";
  parentId?: string | null;
  locationId?: string;
  initialData?: {
    name: string;
    description?: string | null;
    fiNumber?: string | null;
    address?: string | null;
    city?: string | null;
    country?: string | null;
  };
  children: React.ReactNode;
  onSuccess?: () => void;
};

/** The form's starting values: the location being edited, or an empty one. */
function formDefaults(initialData: Props["initialData"]): LocationFormValues {
  return {
    name: initialData?.name || "",
    description: initialData?.description || "",
    fiNumber: initialData?.fiNumber || "",
    address: initialData?.address || "",
    city: initialData?.city || "",
    country: initialData?.country || "",
  };
}

export function LocationFormDialog({
  mode,
  parentId,
  locationId,
  initialData,
  children,
  onSuccess,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const showApiError = useApiErrorToast();
  const [open, setOpen] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<{ id: string; name: string } | null>(null);
  const [merging, setMerging] = useState(false);
  const t = useTranslations("locationForm");
  const tLoc = useTranslations("location");
  const tCommon = useTranslations("common");
  const tField = useTranslations("field");

  const validationSchema = useMemo(() => buildLocationFormSchema(t), [t]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<LocationFormValues>({
    resolver: zodResolver(validationSchema),
    defaultValues: formDefaults(initialData),
  });

  const fiValue = useWatch({ control, name: "fiNumber" }) ?? "";
  const parsedFi = parseFiNumber(fiValue);

  function handleFiInput(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = autoFormatFiNumber(e.target.value);
    setValue("fiNumber", formatted, { shouldValidate: true });
  }

  async function onSubmit(data: LocationFormValues) {
    const url =
      mode === "create" ? "/api/locations" : `/api/locations/${locationId}`;
    const method = mode === "create" ? "POST" : "PUT";

    const payload = {
      ...data,
      parentId,
      fiNumber: data.fiNumber || null,
    };

    const res = await apiFetch(url, jsonBody(method, payload));

    if (!res.ok) {
      // Renaming onto an existing sibling name — offer to merge instead of
      // creating a duplicate.
      const { code, existingId, existingName } = res.error;
      if (code === "locationNameExists" && typeof existingId === "string") {
        setMergeTarget({ id: existingId, name: String(existingName ?? "") });
        return;
      }
      showApiError(res.error);
      return;
    }

    toast({ title: mode === "create" ? tLoc("locationCreated") : tLoc("locationUpdated") });
    setOpen(false);
    reset();
    router.refresh();
    onSuccess?.();
  }

  async function handleMerge() {
    if (!mergeTarget) return;
    setMerging(true);
    const res = await apiFetch(`/api/locations/${locationId}/merge`, jsonBody("POST", { targetId: mergeTarget.id }));
    setMerging(false);

    if (!res.ok) {
      showApiError(res.error);
      return;
    }

    const targetId = mergeTarget.id;
    toast({ title: tLoc("locationMerged") });
    setMergeTarget(null);
    setOpen(false);
    reset();
    router.push(`/locations/${targetId}`);
    router.refresh();
    onSuccess?.();
  }

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (v) {
      // Reset form to initial values when reopening
      reset(formDefaults(initialData));
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? t("createTitle") : t("editTitle")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="loc-name">
              {tField("name")} <span aria-hidden="true" className="text-destructive">*</span>
            </Label>
            <Input
              id="loc-name"
              aria-required="true"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "loc-name-err" : undefined}
              {...register("name")}
              placeholder={t("namePlaceholder")}
            />
            {errors.name && (
              <p id="loc-name-err" className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="loc-desc">{tField("description")}</Label>
            <Textarea
              id="loc-desc"
              {...register("description")}
              placeholder={t("descriptionPlaceholder")}
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="loc-fi" className="flex items-center gap-1.5">
              <Hash className="h-3.5 w-3.5 text-muted-foreground" />
              {tField("fiNumber")}
              <span className="text-xs text-muted-foreground font-normal ml-1">
                ({tCommon("optional")})
              </span>
            </Label>
            <Input
              id="loc-fi"
              value={fiValue}
              onChange={handleFiInput}
              placeholder={t("fiNumberPlaceholder")}
              className="font-mono"
              maxLength={13}
              aria-invalid={!!errors.fiNumber}
              aria-describedby={errors.fiNumber ? "loc-fi-err" : undefined}
            />
            {errors.fiNumber && (
              <p id="loc-fi-err" className="text-xs text-destructive">{errors.fiNumber.message}</p>
            )}
            {/* Live breakdown */}
            {parsedFi && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2">
                <span>
                  <span className="font-medium text-foreground">{tField("campus")}:</span>{" "}
                  {parsedFi.campus}
                </span>
                <span>
                  <span className="font-medium text-foreground">{tField("building")}:</span>{" "}
                  {parsedFi.building}
                </span>
                <span>
                  <span className="font-medium text-foreground">{tField("floor")}:</span>{" "}
                  {parsedFi.floor}
                </span>
                <span>
                  <span className="font-medium text-foreground">{tField("room")}:</span>{" "}
                  {parsedFi.room}
                </span>
              </div>
            )}
            {!parsedFi && fiValue.length > 0 && !errors.fiNumber && (
              <p className="text-xs text-muted-foreground">
                {t("fiNumberTypingHint")}
              </p>
            )}
          </div>

          <div className="pt-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              {tField("address")} ({tCommon("optional")})
            </p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="loc-address">{tField("streetAddress")}</Label>
                <Input
                  id="loc-address"
                  {...register("address")}
                  placeholder={t("addressPlaceholder")}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="loc-city">{tField("city")}</Label>
                  <Input
                    id="loc-city"
                    {...register("city")}
                    placeholder={t("cityPlaceholder")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="loc-country">{tField("country")}</Label>
                  <Input
                    id="loc-country"
                    {...register("country")}
                    placeholder={t("countryPlaceholder")}
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "create" ? t("createSubmit") : t("updateSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <AlertDialog open={mergeTarget !== null} onOpenChange={(v) => !v && setMergeTarget(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{tLoc("mergeConfirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {tLoc("mergeConfirmDescription", { name: mergeTarget?.name ?? "" })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={merging}>{tCommon("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void handleMerge();
            }}
            disabled={merging}
            className="bg-primary hover:bg-primary-hover text-white"
          >
            {merging && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {tLoc("mergeButton")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
