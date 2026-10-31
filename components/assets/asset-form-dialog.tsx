"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, useWatch, type PathValue } from "react-hook-form";
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
import { ModelAutocomplete } from "@/components/inventory/model-autocomplete";
import { cn, apiErrorMessage } from "@/lib/utils";
import { toIsoDay } from "@/lib/dates";
import { isHostnameCompliant } from "@/lib/hostname";
import { normalizeMacAddress } from "@/lib/mac-address";
import { isWindowActive } from "@/lib/suppliers/window";
import { CRITICALITY_VALUES } from "@/lib/criticality";
import { Loader2, Plus, Trash2, KeyRound, CheckCircle2, XCircle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useTranslations } from "next-intl";
import { MacAddressFields } from "@/components/inventory/mac-address-fields";
import { useTypeScopedManufacturers } from "@/components/inventory/use-type-scoped-manufacturers";
import { ManufacturerAutocomplete } from "@/components/inventory/manufacturer-autocomplete";
import { Criticality } from "@/generated/prisma/enums";
import { apiFetch, jsonBody } from "@/lib/api-client";
import { hasDeviceIdentity } from "@/lib/schemas/asset";


type AssetType = { id: string; name: string; hostnamePattern?: string | null; defaultCriticality?: Criticality | null };

/** The fields of GET /api/assets/[id] the edit form loads. */
type EditedAsset = {
  typeId: string | null;
  manufacturerId: string | null;
  modelId: string | null;
  serialNumber: string | null;
  hostname: string | null;
  quantity: number | null;
  installationDate: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  notes: string | null;
  vaultPath: string | null;
  ownerId: string | null;
  criticality: Criticality | null;
  endOfSupportDate: string | null;
  supplierId: string | null;
  macAddresses: { address: string }[];
  customFields: { key: string; value: string }[];
};
type Supplier = {
  id: string;
  name: string;
  defaultFrom: string | null;
  defaultUntil: string | null;
};
type UserLite = { id: string; name: string };

type VaultTestResult = {
  ok: boolean;
  message: string;
  keys?: string[];
};

type AssetFormTranslator = ReturnType<typeof useTranslations<"assetForm">>;

/** MAC rows with any text: a typed (even not yet valid) MAC already makes the asset one device. */
function filledMacCount(macAddresses: { address: string }[]): number {
  return macAddresses.filter((m) => m.address.trim() !== "").length;
}

/** Client mirror of lib/schemas/asset.ts, with translated messages and the selected type's hostname pattern. */
function buildAssetFormSchema(t: AssetFormTranslator, assetTypes: AssetType[]) {
  const macSchema = z.object({
    address: z.string().min(1, t("errMacRequired")).refine(
      (v) => normalizeMacAddress(v) !== null,
      t("errMacInvalid")
    ),
  });
  return z.object({
    typeId: z.string().min(1, t("errTypeRequired")),
    manufacturerId: z.string().min(1, t("errManufacturerRequired")),
    modelId: z.string().min(1, t("errModelRequired")),
    serialNumber: z.string().max(100).optional(),
    hostname: z.string().max(255).optional(),
    // An emptied number input gives NaN: show the same message, not Zod's default.
    quantity: z.number({ error: t("errQuantityMin") }).int().min(1, t("errQuantityMin")).max(9999),
    installationDate: z.string().optional(),
    invoiceNumber: z.string().max(100).optional(),
    invoiceDate: z.string().optional(),
    notes: z.string().max(5000).optional(),
    vaultPath: z.string().max(500).optional(),
    ownerId: z.string().max(64).optional(),
    // "" is the "inherit from type" choice.
    criticality: z.union([z.enum(Criticality), z.literal("")]).optional(),
    endOfSupportDate: z.string().optional(),
    supplierId: z.string().max(64).optional(),
    macAddresses: z.array(macSchema),
    customFields: z.array(z.object({ key: z.string(), value: z.string() })),
  }).superRefine((data, ctx) => {
    const hostnameTrimmed = data.hostname?.trim();
    const hostnameSet = !!hostnameTrimmed;
    const hasValidMac = data.macAddresses.some(
      (m) => normalizeMacAddress(m.address.trim()) !== null
    );
    if (hostnameSet && !hasValidMac) {
      ctx.addIssue({
        code: "custom",
        path: ["macAddresses"],
        message: t("errMacRequiredForHostname"),
      });
    }
    if (hostnameSet) {
      const selectedType = assetTypes.find((at) => at.id === data.typeId);
      const pattern = selectedType?.hostnamePattern;
      if (!isHostnameCompliant(hostnameTrimmed!, pattern)) {
        ctx.addIssue({
          code: "custom",
          path: ["hostname"],
          message: pattern
            ? t("errHostnamePattern", { typeName: selectedType?.name ?? "" })
            : t("errHostnameFqdn"),
        });
      }
    }
    if (hasDeviceIdentity({ ...data, macCount: filledMacCount(data.macAddresses) }) && data.quantity !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["quantity"],
        message: t("errQuantityIdentity"),
      });
    }
  });
}

type AssetFormValues = z.infer<ReturnType<typeof buildAssetFormSchema>>;

/** A blank form: the defaults, and what create mode and a successful save reset to. */
const EMPTY_ASSET_FORM: Partial<AssetFormValues> = {
  typeId: "",
  manufacturerId: "",
  modelId: "",
  quantity: 1,
  macAddresses: [],
  customFields: [],
  vaultPath: "",
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

  const [open, setOpen] = useState(false);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [usersLite, setUsersLite] = useState<UserLite[]>([]);
  const [vaultTestResult, setVaultTestResult] = useState<VaultTestResult | null>(null);
  const [vaultTesting, setVaultTesting] = useState(false);

  const validationSchema = useMemo(() => buildAssetFormSchema(t, assetTypes), [t, assetTypes]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    trigger,
    control,
    formState: { errors, isSubmitting },
  } = useForm<AssetFormValues>({
    resolver: zodResolver(validationSchema),
    defaultValues: EMPTY_ASSET_FORM,
  });

  /**
   * onValueChange for a Select whose "clear" option is `sentinel`. Radix can
   * fire onValueChange("") on its own — e.g. when an option list finishes
   * loading after fetchAsset()'s reset() already set the value. No SelectItem
   * ever has value="", so a raw "" is that internal noise, not a user pick:
   * ignore it rather than silently wiping the field. Item values are the
   * field's own option values, hence the cast.
   */
  function pickSelect<K extends "typeId" | "ownerId" | "supplierId" | "criticality">(field: K, sentinel: string) {
    return (v: string) => {
      if (v === "") return;
      setValue(field, (v === sentinel ? "" : v) as PathValue<AssetFormValues, K>, { shouldValidate: true });
    };
  }

  const { fields: macFields, append: appendMac, remove: removeMac } = useFieldArray({
    control,
    name: "macAddresses",
  });
  const { fields: cfFields, append: appendCf, remove: removeCf } = useFieldArray({
    control,
    name: "customFields",
  });

  const modelIdValue = useWatch({ control, name: "modelId" });
  const serialNumberValue = useWatch({ control, name: "serialNumber" });
  const hostnameValue = useWatch({ control, name: "hostname" });
  const vaultPathValue = useWatch({ control, name: "vaultPath" });
  const macValues = useWatch({ control, name: "macAddresses" });
  const typeIdValue = useWatch({ control, name: "typeId" });
  const manufacturerIdValue = useWatch({ control, name: "manufacturerId" });
  const ownerIdValue = useWatch({ control, name: "ownerId" });
  const criticalityValue = useWatch({ control, name: "criticality" });
  const supplierIdValue = useWatch({ control, name: "supplierId" });

  // Re-validate MAC rule when hostname changes and we already have MACs shown
  useEffect(() => {
    if (macFields.length > 0) trigger("macAddresses");
  }, [hostnameValue, macFields.length, trigger]);

  // Lock quantity to 1 as soon as the asset gains an individual identity
  // (same rule as the validation above and the API).
  const macCount = filledMacCount(macValues);
  const hasIdentity = hasDeviceIdentity({ serialNumber: serialNumberValue, hostname: hostnameValue, macCount });
  useEffect(() => {
    if (hasIdentity) setValue("quantity", 1, { shouldValidate: true });
  }, [hasIdentity, setValue]);

  const fetchDropdowns = useCallback(async () => {
    const [typesRes, suppliersRes, usersRes] = await Promise.all([
      apiFetch<AssetType[]>("/api/asset-types"),
      apiFetch<Supplier[]>("/api/suppliers"),
      apiFetch<UserLite[]>("/api/users/lite"),
    ]);
    if (typesRes.ok) setAssetTypes(typesRes.data);
    const fetchedSuppliers = suppliersRes.ok ? suppliersRes.data : [];
    if (suppliersRes.ok) setSuppliers(fetchedSuppliers);
    if (usersRes.ok) setUsersLite(usersRes.data);
    return fetchedSuppliers;
  }, []);

  const fetchAsset = useCallback(async () => {
    if (mode !== "edit" || !assetId) return;
    const res = await apiFetch<EditedAsset>(`/api/assets/${assetId}`);
    if (!res.ok) return;
    const asset = res.data;
    reset({
      typeId: asset.typeId || "",
      manufacturerId: asset.manufacturerId || "",
      modelId: asset.modelId || "",
      serialNumber: asset.serialNumber || "",
      hostname: asset.hostname || "",
      quantity: asset.quantity ?? 1,
      installationDate: toIsoDay(asset.installationDate) ?? "",
      invoiceNumber: asset.invoiceNumber || "",
      invoiceDate: toIsoDay(asset.invoiceDate) ?? "",
      notes: asset.notes || "",
      vaultPath: asset.vaultPath || "",
      ownerId: asset.ownerId || "",
      criticality: asset.criticality || "",
      endOfSupportDate: toIsoDay(asset.endOfSupportDate) ?? "",
      supplierId: asset.supplierId || "",
      macAddresses: asset.macAddresses.map((m) => ({ address: m.address })),
      customFields: asset.customFields.map((f) => ({ key: f.key, value: f.value })),
    });
  }, [mode, assetId, reset]);

  useEffect(() => {
    if (open) {
      const dropdowns = fetchDropdowns();
      if (mode === "edit") {
        fetchAsset();
      } else {
        // Clear any values left over from a previous (e.g. cancelled) entry —
        // the form component stays mounted across open/close, so create mode
        // must reset explicitly rather than relying on defaultValues.
        reset(EMPTY_ASSET_FORM);
        // Pre-select the supplier whose default window covers today (the API
        // would apply the same default; showing it keeps the form honest).
        dropdowns.then((fetched) => {
          const current = fetched.find((s) => isWindowActive(s, new Date()));
          if (current) setValue("supplierId", current.id);
        });
      }
      setVaultTestResult(null);
    }
  }, [open, fetchDropdowns, fetchAsset, mode, reset, setValue]);

  const manufacturers = useTypeScopedManufacturers({
    open,
    typeId: typeIdValue,
    manufacturerId: manufacturerIdValue,
    onSelectionInvalid: () => {
      setValue("manufacturerId", "", { shouldValidate: false });
      setValue("modelId", "", { shouldValidate: false });
    },
  });

  async function handleTestVault() {
    const path = vaultPathValue?.trim();
    if (!path) return;
    setVaultTesting(true);
    setVaultTestResult(null);
    const res = await apiFetch<{ message?: string; keys?: string[] }>(`/api/vault/test?path=${encodeURIComponent(path)}`);
    setVaultTesting(false);
    if (res.ok) {
      setVaultTestResult({ ok: true, message: res.data.message || t("vaultUnknown"), keys: res.data.keys });
    } else {
      setVaultTestResult({
        ok: false,
        // status 0: the request never reached the server
        message: res.status === 0 ? t("vaultNetworkError") : res.error.error || t("vaultUnknown"),
      });
    }
  }

  async function onSubmit(data: AssetFormValues) {
    const payload = {
      ...data,
      typeId: data.typeId || null,
      manufacturerId: data.manufacturerId || null,
      hostname: data.hostname?.trim() || null,
      vaultPath: data.vaultPath?.trim() || null,
      // Empty on create = "use default" (owner setting / supplier window) —
      // the API applies defaults only when the field is absent, so omit it.
      // Empty on edit = explicit clear (null).
      ownerId: data.ownerId || (mode === "create" ? undefined : null),
      supplierId: data.supplierId || (mode === "create" ? undefined : null),
      criticality: data.criticality || null,
      endOfSupportDate: data.endOfSupportDate || null,
      macAddresses: data.macAddresses
        .map((m) => m.address.trim())
        .filter(Boolean)
        .map((address) => normalizeMacAddress(address) ?? address),
      customFields: data.customFields.filter((f) => f.key),
    };

    const url =
      mode === "create"
        ? `/api/locations/${locationId}/assets`
        : `/api/assets/${assetId}`;
    const method = mode === "create" ? "POST" : "PUT";

    const res = await apiFetch(url, jsonBody(method, payload));

    if (!res.ok) {
      toast({
        title: tCommon("error"),
        description: apiErrorMessage(res.error, tCommon("somethingWentWrong")),
        variant: "destructive",
      });
      return;
    }

    toast({ title: mode === "create" ? tAsset("assetCreated") : tAsset("assetUpdated") });
    setOpen(false);
    reset(EMPTY_ASSET_FORM);
    router.refresh();
    onSuccess?.();
  }

  // Derived state for contextual hints
  const hostnameSet = !!hostnameValue?.trim();
  const selectedTypePattern = assetTypes.find((at) => at.id === typeIdValue)?.hostnamePattern;

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

            <div className="space-y-1.5">
              <Label htmlFor="asset-type">
                {tField("type")} <span aria-hidden="true" className="text-destructive">*</span>
              </Label>
              <Select
                value={typeIdValue || ""}
                onValueChange={pickSelect("typeId", "_none")}
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

            <div className="space-y-1.5 relative">
              <Label htmlFor="asset-manufacturer">
                {tField("manufacturer")} <span aria-hidden="true" className="text-destructive">*</span>
              </Label>
              <ManufacturerAutocomplete
                id="asset-manufacturer"
                aria-required="true"
                aria-invalid={!!errors.manufacturerId}
                aria-describedby={errors.manufacturerId ? "asset-manufacturer-err" : undefined}
                value={manufacturerIdValue}
                options={manufacturers}
                placeholder={t("selectManufacturer")}
                error={!!errors.manufacturerId}
                noneLabel={t("noneManufacturer")}
                onChange={(id, picked) => setValue("manufacturerId", id, { shouldValidate: picked })}
              />
              {errors.manufacturerId && (
                <p id="asset-manufacturer-err" className="text-xs text-destructive">{errors.manufacturerId.message}</p>
              )}
            </div>

            <div className="space-y-1.5 relative col-span-2">
              <Label htmlFor="model">
                {tField("model")} <span aria-hidden="true" className="text-destructive">*</span>
              </Label>
              <ModelAutocomplete
                id="model"
                aria-required="true"
                aria-invalid={!!errors.modelId}
                aria-describedby={errors.modelId ? "model-err" : undefined}
                value={modelIdValue}
                typeId={typeIdValue}
                manufacturerId={manufacturerIdValue}
                placeholder={t("modelPlaceholder")}
                error={!!errors.modelId}
                emptyLabel={t("modelNoneForScope")}
                noMatchLabel={(v) => t("modelNoResults", { value: v })}
                onChange={(modelId, option) => {
                  setValue("modelId", modelId, { shouldValidate: true });
                  if (option) {
                    if (!typeIdValue) setValue("typeId", option.typeId, { shouldValidate: true });
                    if (!manufacturerIdValue && option.manufacturerId) {
                      setValue("manufacturerId", option.manufacturerId, { shouldValidate: true });
                    }
                  }
                }}
              />
              {errors.modelId && (
                <p id="model-err" className="text-xs text-destructive">{errors.modelId.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="serialNumber">{tField("serialNumber")}</Label>
              <Input
                id="serialNumber"
                {...register("serialNumber")}
                placeholder={t("serialPlaceholder")}
              />
            </div>

            {/* Quantity — locked to 1 once the asset has an individual identity */}
            <div className="space-y-1.5">
              <Label htmlFor="quantity">{tField("quantity")}</Label>
              <Input
                id="quantity"
                type="number"
                min={1}
                step={1}
                aria-invalid={!!errors.quantity}
                aria-describedby={errors.quantity ? "quantity-err" : "quantity-hint"}
                {...register("quantity", { valueAsNumber: true })}
                disabled={hasIdentity}
                className={cn(errors.quantity && "border-destructive")}
              />
              {errors.quantity ? (
                <p id="quantity-err" className="text-xs text-destructive">{errors.quantity.message}</p>
              ) : (
                <p id="quantity-hint" className="text-xs text-muted-foreground">{t("quantityHint")}</p>
              )}
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
                <p id="hostname-hint" className={cn("text-xs text-muted-foreground", selectedTypePattern && "font-mono")}>
                  {selectedTypePattern ? t("hostnamePatternHint", { pattern: selectedTypePattern }) : t("hostnameHint")}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="installationDate">{tField("installationDate")}</Label>
              <Input
                id="installationDate"
                type="date"
                {...register("installationDate")}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invoiceNumber">{tField("invoiceNumber")}</Label>
              <Input
                id="invoiceNumber"
                {...register("invoiceNumber")}
                placeholder={t("invoicePlaceholder")}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invoiceDate">{tField("invoiceDate")}</Label>
              <Input id="invoiceDate" type="date" {...register("invoiceDate")} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="asset-owner">{tField("owner")}</Label>
              <Select
                value={ownerIdValue || "_none"}
                onValueChange={pickSelect("ownerId", "_none")}
              >
                <SelectTrigger id="asset-owner">
                  <SelectValue placeholder={t("ownerDefault")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">{t("ownerDefault")}</SelectItem>
                  {usersLite.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="asset-supplier">{tField("supplier")}</Label>
              <Select
                value={supplierIdValue || "_none"}
                onValueChange={pickSelect("supplierId", "_none")}
              >
                <SelectTrigger id="asset-supplier">
                  <SelectValue placeholder={t("noneSupplier")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">{t("noneSupplier")}</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="asset-criticality">{tField("criticality")}</Label>
              <Select
                value={criticalityValue || "_inherit"}
                onValueChange={pickSelect("criticality", "_inherit")}
              >
                <SelectTrigger id="asset-criticality">
                  <SelectValue placeholder={t("criticalityInherit")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_inherit">
                    {(() => {
                      const typeDefault = assetTypes.find((at) => at.id === typeIdValue)?.defaultCriticality;
                      return typeDefault
                        ? t("criticalityInheritWith", { level: tCommon(`criticality.${typeDefault}`) })
                        : t("criticalityInherit");
                    })()}
                  </SelectItem>
                  {CRITICALITY_VALUES.map((level) => (
                    <SelectItem key={level} value={level}>{tCommon(`criticality.${level}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="endOfSupportDate">{tField("endOfSupport")}</Label>
              <Input id="endOfSupportDate" type="date" {...register("endOfSupportDate")} />
            </div>
          </div>

          <MacAddressFields
            fields={macFields}
            register={register}
            errors={errors.macAddresses}
            onAdd={() => appendMac({ address: "" })}
            onRemove={removeMac}
            required={hostnameSet && macCount === 0}
            helpText={hostnameSet ? tAsset("macHelpText") : undefined}
            listError={macCrossError}
          />

          <div className="space-y-1.5">
            <Label htmlFor="notes">{tField("notes")}</Label>
            <Textarea
              id="notes"
              {...register("notes")}
              placeholder={t("notesPlaceholder")}
              rows={3}
            />
          </div>

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
                  aria-label={tCommon("remove")}
                  className="text-destructive hover:text-destructive flex-shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

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
                      {t("vaultKeys")}{" "}
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
