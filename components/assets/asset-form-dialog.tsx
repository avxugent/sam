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
import { ModelAutocomplete } from "@/components/inventory/model-autocomplete";
import { cn, toIsoDay, apiErrorMessage } from "@/lib/utils";
import { isHostnameCompliant } from "@/lib/hostname/pattern";
import { normalizeMacAddress } from "@/lib/mac-address";
import { isWindowActive } from "@/lib/suppliers/window";
import { CRITICALITY_VALUES } from "@/lib/criticality";
import { Loader2, Plus, Trash2, KeyRound, CheckCircle2, XCircle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useTranslations } from "next-intl";
import { MacAddressFields } from "@/components/inventory/mac-address-fields";
import { useTypeScopedManufacturers } from "@/components/inventory/use-type-scoped-manufacturers";
import type { Criticality } from "@/generated/prisma/enums";


type AssetType = { id: string; name: string; hostnamePattern?: string | null; defaultCriticality?: Criticality | null };
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
    quantity: z.number().int().min(1, t("errQuantityMin")),
    installationDate: z.string().optional(),
    invoiceNumber: z.string().max(100).optional(),
    invoiceDate: z.string().optional(),
    notes: z.string().max(5000).optional(),
    vaultPath: z.string().max(500).optional(),
    ownerId: z.string().max(64).optional(),
    criticality: z.string().max(20).optional(),
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
    const hasIdentity = !!data.serialNumber?.trim() || hostnameSet || hasValidMac;
    if (hasIdentity && data.quantity !== 1) {
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
  const [manufacturerSearch, setManufacturerSearch] = useState("");
  const [showManufacturerDropdown, setShowManufacturerDropdown] = useState(false);
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
  const hasAnyMac = macValues.some((m) => m.address.trim() !== "");
  const hasIdentityValue = !!serialNumberValue?.trim() || !!hostnameValue?.trim() || hasAnyMac;
  useEffect(() => {
    if (hasIdentityValue) setValue("quantity", 1, { shouldValidate: true });
  }, [hasIdentityValue, setValue]);

  const fetchDropdowns = useCallback(async () => {
    const [typesRes, suppliersRes, usersRes] = await Promise.all([
      fetch("/api/asset-types"),
      fetch("/api/suppliers"),
      fetch("/api/users/lite"),
    ]);
    if (typesRes.ok) setAssetTypes(await typesRes.json());
    let fetchedSuppliers: Supplier[] = [];
    if (suppliersRes.ok) {
      fetchedSuppliers = await suppliersRes.json();
      setSuppliers(fetchedSuppliers);
    }
    if (usersRes.ok) setUsersLite(await usersRes.json());
    return fetchedSuppliers;
  }, []);

  const fetchAsset = useCallback(async () => {
    if (mode !== "edit" || !assetId) return;
    const res = await fetch(`/api/assets/${assetId}`);
    if (!res.ok) return;
    const asset = await res.json();
    reset({
      typeId: asset.typeId || "",
      manufacturerId: asset.manufacturerId || "",
      modelId: asset.modelId || "",
      serialNumber: asset.serialNumber || "",
      hostname: asset.hostname || "",
      quantity: asset.quantity ?? 1,
      installationDate: asset.installationDate
        ? toIsoDay(asset.installationDate)
        : "",
      invoiceNumber: asset.invoiceNumber || "",
      invoiceDate: asset.invoiceDate
        ? toIsoDay(asset.invoiceDate)
        : "",
      notes: asset.notes || "",
      vaultPath: asset.vaultPath || "",
      ownerId: asset.ownerId || "",
      criticality: asset.criticality || "",
      endOfSupportDate: asset.endOfSupportDate
        ? toIsoDay(asset.endOfSupportDate)
        : "",
      supplierId: asset.supplierId || "",
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

  // Sync manufacturer display name when manufacturerId or manufacturers list changes (handles edit mode)
  useEffect(() => {
    const m = manufacturers.find((m) => m.id === manufacturerIdValue);
    setManufacturerSearch(m ? m.name : "");
  }, [manufacturerIdValue, manufacturers]);

  async function handleTestVault() {
    const path = vaultPathValue?.trim();
    if (!path) return;
    setVaultTesting(true);
    setVaultTestResult(null);
    try {
      const res = await fetch(`/api/vault/test?path=${encodeURIComponent(path)}`);
      const data = await res.json().catch(() => ({}));
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

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({
        title: tCommon("error"),
        description: apiErrorMessage(err, tCommon("somethingWentWrong")),
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

  const filteredManufacturers = manufacturers.filter((m) =>
    m.name.toLowerCase().includes(manufacturerSearch.toLowerCase())
  );

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

            {/* Type — required */}
            <div className="space-y-1.5">
              <Label htmlFor="asset-type">
                {tField("type")} <span aria-hidden="true" className="text-destructive">*</span>
              </Label>
              <Select
                value={typeIdValue || ""}
                onValueChange={(v) => {
                  // Radix can fire onValueChange("") on its own — e.g. when the
                  // asset types list finishes loading after this field's value
                  // was already set by fetchAsset()'s reset(). No SelectItem
                  // ever has value="" (the clear option is "_none"), so a raw
                  // "" here is always that internal noise, not a user pick —
                  // ignore it rather than silently wiping the field.
                  if (v === "") return;
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
                disabled={hasIdentityValue}
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
                onValueChange={(v) => {
                  // See the Type select above — Radix can spuriously fire "".
                  if (v === "") return;
                  setValue("ownerId", v === "_none" ? "" : v, { shouldValidate: true });
                }}
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
                onValueChange={(v) => {
                  // See the Type select above — Radix can spuriously fire "".
                  if (v === "") return;
                  setValue("supplierId", v === "_none" ? "" : v, { shouldValidate: true });
                }}
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
                onValueChange={(v) => {
                  // See the Type select above — Radix can spuriously fire "".
                  if (v === "") return;
                  setValue("criticality", v === "_inherit" ? "" : v, { shouldValidate: true });
                }}
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
            required={hostnameSet && !hasAnyMac}
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
