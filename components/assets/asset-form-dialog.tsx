"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
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
import { cn } from "@/lib/utils";
import { Loader2, Plus, Trash2, KeyRound, CheckCircle2, XCircle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useTranslations } from "next-intl";

// ── Validation helpers ──────────────────────────────────────────────────────

/**
 * RFC-1123 FQDN: labels separated by dots, each 1-63 chars, only alphanum + hyphen,
 * must not start or end with a hyphen, at least two labels required.
 * Examples: rectest001.ugent.be  projector-room101.example.com
 */
const FQDN_REGEX =
  /^(?!-)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

/**
 * IEEE 802 MAC address — colon, hyphen, or dot-separated, upper or lower case.
 * Accepts: AA:BB:CC:DD:EE:FF  aa-bb-cc-dd-ee-ff  AABB.CCDD.EEFF
 */
const MAC_REGEX =
  /^([0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}$|^([0-9A-Fa-f]{4}\.){2}[0-9A-Fa-f]{4}$/;

const macAddressSchema = z.object({
  address: z
    .string()
    .min(1, "MAC address is required")
    .regex(MAC_REGEX, "Invalid MAC address (expected AA:BB:CC:DD:EE:FF)"),
});

const schema = z
  .object({
    typeId: z.string().min(1, "Type is required"),
    manufacturerId: z.string().min(1, "Manufacturer is required"),
    model: z.string().min(1, "Model is required").max(255),
    serialNumber: z.string().max(100).optional(),
    hostname: z
      .string()
      .max(255)
      .optional()
      .refine(
        (v) => !v || v.trim() === "" || FQDN_REGEX.test(v.trim()),
        "Hostname must be a fully qualified domain name (e.g. device.example.com)"
      ),
    installationDate: z.string().optional(),
    invoiceNumber: z.string().max(100).optional(),
    invoiceDate: z.string().optional(),
    notes: z.string().max(5000).optional(),
    vaultPath: z.string().max(500).optional(),
    macAddresses: z.array(macAddressSchema),
    customFields: z.array(z.object({ key: z.string(), value: z.string() })),
  })
  .superRefine((data, ctx) => {
    const hostnameSet = !!data.hostname?.trim();
    const hasValidMac = data.macAddresses.some(
      (m) => m.address.trim() !== "" && MAC_REGEX.test(m.address.trim())
    );

    // Rule: if hostname is filled, at least one MAC is required
    if (hostnameSet && !hasValidMac) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["macAddresses"],
        message:
          "At least one MAC address is required when a hostname is set.",
      });
    }
  });

type FormData = z.infer<typeof schema>;

type AssetType = { id: string; name: string };
type Manufacturer = { id: string; name: string };
type ModelSuggestion = { model: string; typeId: string | null; manufacturerId: string | null };

type VaultTestResult = {
  ok: boolean;
  message: string;
  keys?: string[];
};

type Props = {
  mode: "create" | "edit";
  locationId: string;
  assetId?: string;
  children: React.ReactNode;
  onSuccess?: () => void;
};

export function AssetFormDialog({ mode, locationId, assetId, children, onSuccess }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("assetForm");
  const tField = useTranslations("field");
  const tCommon = useTranslations("common");
  const tAsset = useTranslations("asset");

  const validationSchema = useMemo(() => {
    const macSchema = z.object({
      address: z.string().min(1, t("errMacRequired")).regex(MAC_REGEX, t("errMacInvalid")),
    });
    return z.object({
      typeId: z.string().min(1, t("errTypeRequired")),
      manufacturerId: z.string().min(1, t("errManufacturerRequired")),
      model: z.string().min(1, t("errModelRequired")).max(255),
      serialNumber: z.string().max(100).optional(),
      hostname: z.string().max(255).optional().refine(
        (v) => !v || v.trim() === "" || FQDN_REGEX.test(v.trim()),
        t("errHostnameFqdn")
      ),
      installationDate: z.string().optional(),
      invoiceNumber: z.string().max(100).optional(),
      invoiceDate: z.string().optional(),
      notes: z.string().max(5000).optional(),
      vaultPath: z.string().max(500).optional(),
      macAddresses: z.array(macSchema),
      customFields: z.array(z.object({ key: z.string(), value: z.string() })),
    }).superRefine((data, ctx) => {
      const hostnameSet = !!data.hostname?.trim();
      const hasValidMac = data.macAddresses.some(
        (m) => m.address.trim() !== "" && MAC_REGEX.test(m.address.trim())
      );
      if (hostnameSet && !hasValidMac) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["macAddresses"],
          message: t("errMacRequiredForHostname"),
        });
      }
    });
  }, [t]);

  const [open, setOpen] = useState(false);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [modelSuggestions, setModelSuggestions] = useState<ModelSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [manufacturerSearch, setManufacturerSearch] = useState("");
  const [showManufacturerDropdown, setShowManufacturerDropdown] = useState(false);
  const [vaultTestResult, setVaultTestResult] = useState<VaultTestResult | null>(null);
  const [vaultTesting, setVaultTesting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    trigger,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(validationSchema),
    defaultValues: {
      typeId: "",
      manufacturerId: "",
      model: "",
      macAddresses: [],
      customFields: [],
      vaultPath: "",
    },
  });

  const { fields: macFields, append: appendMac, remove: removeMac } = useFieldArray({
    control,
    name: "macAddresses",
  });
  const { fields: cfFields, append: appendCf, remove: removeCf } = useFieldArray({
    control,
    name: "customFields",
  });

  const modelValue = useWatch({ control, name: "model" });
  const hostnameValue = useWatch({ control, name: "hostname" });
  const vaultPathValue = useWatch({ control, name: "vaultPath" });
  const macValues = useWatch({ control, name: "macAddresses" });
  const typeIdValue = useWatch({ control, name: "typeId" });
  const manufacturerIdValue = useWatch({ control, name: "manufacturerId" });

  // Re-validate MAC rule when hostname changes and we already have MACs shown
  useEffect(() => {
    if (macFields.length > 0) trigger("macAddresses");
  }, [hostnameValue, macFields.length, trigger]);

  const fetchDropdowns = useCallback(async () => {
    const [typesRes, mfrsRes] = await Promise.all([
      fetch("/api/asset-types"),
      fetch("/api/manufacturers"),
    ]);
    if (typesRes.ok) setAssetTypes(await typesRes.json());
    if (mfrsRes.ok) setManufacturers(await mfrsRes.json());
  }, []);

  const fetchAsset = useCallback(async () => {
    if (mode !== "edit" || !assetId) return;
    const res = await fetch(`/api/assets/${assetId}`);
    if (!res.ok) return;
    const asset = await res.json();
    reset({
      typeId: asset.typeId || "",
      manufacturerId: asset.manufacturerId || "",
      model: asset.model || "",
      serialNumber: asset.serialNumber || "",
      hostname: asset.hostname || "",
      installationDate: asset.installationDate
        ? new Date(asset.installationDate).toISOString().split("T")[0]
        : "",
      invoiceNumber: asset.invoiceNumber || "",
      invoiceDate: asset.invoiceDate
        ? new Date(asset.invoiceDate).toISOString().split("T")[0]
        : "",
      notes: asset.notes || "",
      vaultPath: asset.vaultPath || "",
      macAddresses: asset.macAddresses.map((m: { address: string }) => ({
        address: m.address,
      })),
      customFields: asset.customFields.map(
        (f: { key: string; value: string }) => ({ key: f.key, value: f.value })
      ),
    });
  }, [mode, assetId, reset]);

  useEffect(() => {
    if (open) {
      fetchDropdowns();
      fetchAsset();
      setVaultTestResult(null);
    }
  }, [open, fetchDropdowns, fetchAsset]);

  // Sync manufacturer display name when manufacturerId or manufacturers list changes (handles edit mode)
  useEffect(() => {
    const m = manufacturers.find((m) => m.id === manufacturerIdValue);
    setManufacturerSearch(m ? m.name : "");
  }, [manufacturerIdValue, manufacturers]);

  // Model autocomplete — filtered by selected type and manufacturer
  useEffect(() => {
    if (!modelValue || modelValue.length < 2) {
      setModelSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ q: modelValue });
      if (typeIdValue) params.set("typeId", typeIdValue);
      if (manufacturerIdValue) params.set("manufacturerId", manufacturerIdValue);
      const res = await fetch(`/api/models?${params}`);
      if (res.ok) setModelSuggestions(await res.json());
    }, 300);
    return () => clearTimeout(timer);
  }, [modelValue, typeIdValue, manufacturerIdValue]);

  async function handleTestVault() {
    const path = vaultPathValue?.trim();
    if (!path) return;
    setVaultTesting(true);
    setVaultTestResult(null);
    try {
      const res = await fetch(`/api/vault/test?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      setVaultTestResult({
        ok: data.ok === true,
        message: data.message || data.error || t("vaultUnknown"),
        keys: data.keys,
      });
    } catch {
      setVaultTestResult({ ok: false, message: t("vaultNetworkError") });
    }
    setVaultTesting(false);
  }

  async function onSubmit(data: FormData) {
    const payload = {
      ...data,
      typeId: data.typeId || null,
      manufacturerId: data.manufacturerId || null,
      hostname: data.hostname?.trim() || null,
      vaultPath: data.vaultPath?.trim() || null,
      macAddresses: data.macAddresses.map((m) => m.address.trim()).filter(Boolean),
      customFields: data.customFields.filter((f) => f.key),
    };

    const url =
      mode === "create"
        ? `/api/locations/${locationId}/assets`
        : `/api/assets/${assetId}`;
    const method = mode === "create" ? "POST" : "PUT";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json();
      toast({
        title: tCommon("error"),
        description: err.error || tCommon("somethingWentWrong"),
        variant: "destructive",
      });
      return;
    }

    toast({ title: mode === "create" ? tAsset("assetCreated") : tAsset("assetUpdated") });
    setOpen(false);
    reset({ typeId: "", manufacturerId: "", model: "", macAddresses: [], customFields: [], vaultPath: "" });
    router.refresh();
    onSuccess?.();
  }

  const filteredManufacturers = manufacturers.filter((m) =>
    m.name.toLowerCase().includes(manufacturerSearch.toLowerCase())
  );

  // Derived state for contextual hints
  const hostnameSet = !!hostnameValue?.trim();
  const hasAnyMac = macValues.some((m) => m.address.trim() !== "");

  // Cross-field error for mac addresses (from superRefine)
  const macCrossError = errors.macAddresses?.root?.message
    ?? (errors.macAddresses as { message?: string } | undefined)?.message;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? t("createTitle") : t("editTitle")}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">

            {/* Type — required */}
            <div className="space-y-1.5">
              <Label htmlFor="asset-type">
                {tField("type")} <span aria-hidden="true" className="text-destructive">*</span>
              </Label>
              <Select
                value={typeIdValue || ""}
                onValueChange={(v) => {
                  setValue("typeId", v === "_none" ? "" : v, { shouldValidate: true });
                }}
              >
                <SelectTrigger
                  id="asset-type"
                  aria-required="true"
                  aria-invalid={!!errors.typeId}
                  aria-describedby={errors.typeId ? "asset-type-err" : undefined}
                  className={cn(errors.typeId && "border-destructive ring-destructive")}
                >
                  <SelectValue placeholder={t("selectType")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">{t("noneType")}</SelectItem>
                  {assetTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.typeId && (
                <p id="asset-type-err" className="text-xs text-destructive">{errors.typeId.message}</p>
              )}
            </div>

            {/* Manufacturer — required, with autocomplete */}
            <div className="space-y-1.5 relative">
              <Label htmlFor="asset-manufacturer">
                {tField("manufacturer")} <span aria-hidden="true" className="text-destructive">*</span>
              </Label>
              <Input
                id="asset-manufacturer"
                aria-required="true"
                aria-invalid={!!errors.manufacturerId}
                aria-describedby={errors.manufacturerId ? "asset-manufacturer-err" : undefined}
                value={manufacturerSearch}
                onChange={(e) => {
                  setManufacturerSearch(e.target.value);
                  setShowManufacturerDropdown(true);
                  setValue("manufacturerId", "", { shouldValidate: false });
                }}
                onFocus={() => setShowManufacturerDropdown(true)}
                onBlur={() => setTimeout(() => setShowManufacturerDropdown(false), 200)}
                placeholder={t("selectManufacturer")}
                autoComplete="off"
                className={cn(errors.manufacturerId && "border-destructive")}
              />
              {errors.manufacturerId && (
                <p id="asset-manufacturer-err" className="text-xs text-destructive">{errors.manufacturerId.message}</p>
              )}
              {showManufacturerDropdown && (
                <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md overflow-hidden max-h-48 overflow-y-auto">
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent text-muted-foreground"
                    onMouseDown={() => {
                      setValue("manufacturerId", "", { shouldValidate: true });
                      setManufacturerSearch("");
                      setShowManufacturerDropdown(false);
                    }}
                  >
                    {t("noneManufacturer")}
                  </button>
                  {filteredManufacturers.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                      onMouseDown={() => {
                        setValue("manufacturerId", m.id, { shouldValidate: true });
                        setManufacturerSearch(m.name);
                        setShowManufacturerDropdown(false);
                      }}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Model — required, with autocomplete */}
            <div className="space-y-1.5 relative col-span-2">
              <Label htmlFor="model">
                {tField("model")} <span aria-hidden="true" className="text-destructive">*</span>
              </Label>
              <Input
                id="model"
                aria-required="true"
                aria-invalid={!!errors.model}
                aria-describedby={errors.model ? "model-err" : undefined}
                {...register("model")}
                placeholder={t("modelPlaceholder")}
                autoComplete="off"
                className={cn(errors.model && "border-destructive")}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              />
              {errors.model && (
                <p id="model-err" className="text-xs text-destructive">{errors.model.message}</p>
              )}
              {showSuggestions && modelSuggestions.length > 0 && (
                <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md overflow-hidden">
                  {modelSuggestions.map((s) => (
                    <button
                      key={s.model}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                      onMouseDown={() => {
                        setValue("model", s.model, { shouldValidate: true });
                        if (!typeIdValue && s.typeId) {
                          setValue("typeId", s.typeId, { shouldValidate: true });
                        }
                        if (!manufacturerIdValue && s.manufacturerId) {
                          setValue("manufacturerId", s.manufacturerId, { shouldValidate: true });
                        }
                        setShowSuggestions(false);
                      }}
                    >
                      {s.model}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Serial number */}
            <div className="space-y-1.5">
              <Label htmlFor="serialNumber">{tField("serialNumber")}</Label>
              <Input
                id="serialNumber"
                {...register("serialNumber")}
                placeholder={t("serialPlaceholder")}
              />
            </div>

            {/* Hostname — optional, must be FQDN if filled */}
            <div className="space-y-1.5">
              <Label htmlFor="hostname">
                {tField("hostname")}
                {hostnameSet && (
                  <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                    ({tAsset("macHelpText")})
                  </span>
                )}
              </Label>
              <Input
                id="hostname"
                aria-invalid={!!errors.hostname}
                aria-describedby={errors.hostname ? "hostname-err" : "hostname-hint"}
                {...register("hostname")}
                placeholder={t("hostnamePlaceholder")}
                className={cn(errors.hostname && "border-destructive")}
              />
              {errors.hostname && (
                <p id="hostname-err" className="text-xs text-destructive">{errors.hostname.message}</p>
              )}
              {!errors.hostname && (
                <p id="hostname-hint" className="text-xs text-muted-foreground">
                  {t("hostnameHint")}
                </p>
              )}
            </div>

            {/* Installation date */}
            <div className="space-y-1.5">
              <Label htmlFor="installationDate">{tField("installationDate")}</Label>
              <Input
                id="installationDate"
                type="date"
                {...register("installationDate")}
              />
            </div>

            {/* Invoice number */}
            <div className="space-y-1.5">
              <Label htmlFor="invoiceNumber">{tField("invoiceNumber")}</Label>
              <Input
                id="invoiceNumber"
                {...register("invoiceNumber")}
                placeholder={t("invoicePlaceholder")}
              />
            </div>

            {/* Invoice date */}
            <div className="space-y-1.5">
              <Label htmlFor="invoiceDate">{tField("invoiceDate")}</Label>
              <Input id="invoiceDate" type="date" {...register("invoiceDate")} />
            </div>
          </div>

          {/* MAC Addresses */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label>
                  {tField("macAddresses")}
                  {hostnameSet && !hasAnyMac && (
                    <span className="ml-1.5 text-destructive text-xs">*</span>
                  )}
                </Label>
                {hostnameSet && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {tAsset("macHelpText")}
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => appendMac({ address: "" })}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                {t("addMacAddress")}
              </Button>
            </div>

            {macFields.map((field, i) => (
              <div key={field.id} className="flex gap-2">
                <Input
                  {...register(`macAddresses.${i}.address`)}
                  aria-label={`${tField("macAddress")} ${i + 1}`}
                  aria-invalid={!!errors.macAddresses?.[i]?.address}
                  aria-describedby={errors.macAddresses?.[i]?.address ? `mac-err-${i}` : undefined}
                  placeholder={t("macPlaceholder")}
                  className={cn(
                    "font-mono",
                    errors.macAddresses?.[i]?.address && "border-destructive"
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("removeMacAriaLabel", { n: i + 1 })}
                  onClick={() => removeMac(i)}
                  className="text-destructive hover:text-destructive flex-shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            {/* Per-entry MAC format errors */}
            {macFields.map((field, i) =>
              errors.macAddresses?.[i]?.address ? (
                <p key={`mac-err-${field.id}`} id={`mac-err-${i}`} className="text-xs text-destructive -mt-1">
                  {t("macLabel", { n: i + 1 })}: {errors.macAddresses[i]?.address?.message}
                </p>
              ) : null
            )}

            {/* Cross-field error: hostname set but no MAC */}
            {macCrossError && (
              <p className="text-xs text-destructive">{macCrossError}</p>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">{tField("notes")}</Label>
            <Textarea
              id="notes"
              {...register("notes")}
              placeholder={t("notesPlaceholder")}
              rows={3}
            />
          </div>

          {/* Custom fields */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{tField("customFields")}</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => appendCf({ key: "", value: "" })}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                {t("addCustomField")}
              </Button>
            </div>
            {cfFields.map((field, i) => (
              <div key={field.id} className="flex gap-2">
                <Input
                  {...register(`customFields.${i}.key`)}
                  placeholder={t("fieldNamePlaceholder")}
                  className="w-1/3"
                />
                <Input
                  {...register(`customFields.${i}.value`)}
                  placeholder={t("fieldValuePlaceholder")}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeCf(i)}
                  className="text-destructive hover:text-destructive flex-shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          {/* Vault credentials path */}
          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {tField("vaultCredentials")} ({tCommon("optional")})
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("vaultPathHelp")} (e.g.{" "}
              <code className="bg-muted px-1 rounded">secret/av/rectest001</code>).
            </p>
            <div className="flex gap-2">
              <Input
                id="vaultPath"
                {...register("vaultPath")}
                placeholder={t("vaultPathPlaceholder")}
                className="font-mono text-sm flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={vaultTesting || !vaultPathValue?.trim()}
                onClick={handleTestVault}
                className="flex-shrink-0"
              >
                {vaultTesting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  t("testVault")
                )}
              </Button>
            </div>

            {vaultTestResult && (
              <div
                className={`flex items-start gap-2 rounded px-2.5 py-2 text-xs ${
                  vaultTestResult.ok
                    ? "bg-green-50 text-green-800 border border-green-200"
                    : "bg-red-50 text-red-800 border border-red-200"
                }`}
              >
                {vaultTestResult.ok ? (
                  <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <p>{vaultTestResult.message}</p>
                  {vaultTestResult.ok && vaultTestResult.keys && (
                    <p className="mt-0.5 text-green-700">
                      Keys:{" "}
                      {vaultTestResult.keys.map((k) => (
                        <code key={k} className="bg-green-100 px-1 rounded mr-1">
                          {k}
                        </code>
                      ))}
                    </p>
                  )}
                </div>
              </div>
            )}
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
  );
}
