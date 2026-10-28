"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { ModelAutocomplete } from "@/components/model-autocomplete";
import { cn, apiErrorMessage } from "@/lib/utils";
import { normalizeMacAddress } from "@/lib/mac-address";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { MacAddressFields } from "@/components/inventory/mac-address-fields";
import { useTypeScopedManufacturers } from "@/components/inventory/use-type-scoped-manufacturers";
import { StockLocationPicker } from "@/components/inventory/stock-location-picker";
import { useLocationOptions } from "@/components/inventory/use-location-options";

type StockItemFormValues = {
  typeId: string;
  manufacturerId?: string;
  modelId: string;
  serialNumber?: string;
  quantity: number;
  notes?: string;
  locationId?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  macAddresses: { address: string }[];
};

type AssetType = { id: string; name: string };

export type StockItemInitialData = {
  typeId: string;
  typeName: string;
  manufacturerId: string | null;
  manufacturerName: string | null;
  modelId: string;
  serialNumber: string | null;
  quantity: number;
  notes: string | null;
  locationId: string | null;
  locationBreadcrumb: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  macAddresses: string[];
};

type Props = {
  mode: "create" | "edit";
  itemId?: string;
  initialData?: StockItemInitialData;
  children: React.ReactNode;
  onSuccess?: () => void;
};

export function StockItemFormDialog({ mode, itemId, initialData, children, onSuccess }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("stock");
  const tCommon = useTranslations("common");
  const tField = useTranslations("field");

  const validationSchema = useMemo(() => z.object({
    typeId: z.string().min(1, t("errTypeRequired")),
    manufacturerId: z.string().optional(),
    modelId: z.string().min(1, t("errModelRequired")),
    serialNumber: z.string().max(100).optional(),
    quantity: z.number().int().min(1, t("errQuantityMin")),
    notes: z.string().max(5000).optional(),
    locationId: z.string().optional(),
    invoiceNumber: z.string().max(100).optional(),
    invoiceDate: z.string().optional(),
    macAddresses: z.array(z.object({
      address: z.string().min(1, t("errMacRequired")).refine(
        (v) => normalizeMacAddress(v) !== null,
        t("errMacInvalid")
      ),
    })),
  }).superRefine((data, ctx) => {
    if (data.serialNumber?.trim() && data.quantity > 1) {
      ctx.addIssue({
        code: "custom",
        path: ["quantity"],
        message: t("errQuantitySerial"),
      });
    }
  }), [t]);

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const { locations } = useLocationOptions(open);
  // Initialised synchronously from prop so the value is ready before any fetch completes
  const [selectedTypeId, setSelectedTypeId] = useState(initialData?.typeId ?? "");
  const [selectedMfgId, setSelectedMfgId] = useState(initialData?.manufacturerId ?? "");
  const [selectedLocationId, setSelectedLocationId] = useState(initialData?.locationId ?? "");

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    trigger,
    control,
    formState: { errors, isSubmitting },
  } = useForm<StockItemFormValues>({
    resolver: zodResolver(validationSchema),
    defaultValues: {
      quantity: initialData?.quantity ?? 1,
      typeId: initialData?.typeId ?? "",
      manufacturerId: initialData?.manufacturerId ?? "",
      modelId: initialData?.modelId ?? "",
      serialNumber: initialData?.serialNumber ?? "",
      notes: initialData?.notes ?? "",
      locationId: initialData?.locationId ?? "",
      invoiceNumber: initialData?.invoiceNumber ?? "",
      invoiceDate: initialData?.invoiceDate ?? "",
      macAddresses: initialData?.macAddresses.map((address) => ({ address })) ?? [],
    },
  });

  const { fields: macFields, append: appendMac, remove: removeMac } = useFieldArray({
    control,
    name: "macAddresses",
  });

  const serialNumber = useWatch({ control, name: "serialNumber" });
  const modelIdValue = useWatch({ control, name: "modelId" });

  useEffect(() => { setMounted(true); }, []);

  // Lock quantity to 1 when serial is set
  useEffect(() => {
    if (serialNumber?.trim()) {
      setValue("quantity", 1, { shouldValidate: true });
    }
  }, [serialNumber, setValue]);

  // Fetch dropdown options when dialog opens
  useEffect(() => {
    if (!open) return;
    fetch("/api/asset-types")
      .then((r) => r.json())
      .then((types: AssetType[]) => setAssetTypes(types));
  }, [open]);

  const manufacturers = useTypeScopedManufacturers({
    open,
    typeId: selectedTypeId,
    manufacturerId: selectedMfgId,
    onSelectionInvalid: () => {
      setSelectedMfgId("");
      setValue("manufacturerId", "", { shouldValidate: false });
      setValue("modelId", "", { shouldValidate: false });
    },
  });

  function handleClose() {
    setOpen(false);
    if (mode === "create") {
      reset({ quantity: 1, typeId: "", manufacturerId: "", modelId: "", serialNumber: "", notes: "", locationId: "", invoiceNumber: "", invoiceDate: "", macAddresses: [] });
      setSelectedTypeId("");
      setSelectedMfgId("");
      setSelectedLocationId("");
    }
  }

  async function onSubmit(data: StockItemFormValues) {
    const url = mode === "create" ? "/api/stock" : `/api/stock/${itemId}`;
    const method = mode === "create" ? "POST" : "PUT";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...data,
        manufacturerId: data.manufacturerId || null,
        serialNumber: data.serialNumber || null,
        notes: data.notes || null,
        locationId: data.locationId || null,
        invoiceNumber: data.invoiceNumber || null,
        invoiceDate: data.invoiceDate || null,
        macAddresses: data.macAddresses.map((m) => m.address.trim()).filter(Boolean),
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({ title: tCommon("error"), description: apiErrorMessage(err), variant: "destructive" });
      return;
    }

    toast({ title: mode === "create" ? t("addedToStock") : t("stockItemUpdated") });
    handleClose();
    onSuccess?.();
    router.refresh();
  }

  // Label for the type trigger: use assetTypes once loaded, fall back to initialData name
  const typeLabel = assetTypes.find((at) => at.id === selectedTypeId)?.name
    ?? (selectedTypeId ? (initialData?.typeName ?? t("selectType")) : t("selectType"));

  const mfgLabel = manufacturers.find((m) => m.id === selectedMfgId)?.name
    ?? (selectedMfgId ? (initialData?.manufacturerName ?? t("selectManufacturer")) : t("selectManufacturer"));

  const locationLabel = selectedLocationId
    ? locations.find((l) => l.id === selectedLocationId)?.breadcrumb ?? initialData?.locationBreadcrumb ?? t("selectLocation")
    : t("unassigned");

  if (!mounted) return <>{children}</>;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true); }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? t("addItem") : t("editItem")}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1">
          {/* Type */}
          <div className="space-y-1">
            <Label htmlFor="typeId">{tField("type")} <span className="text-destructive">*</span></Label>
            <Select
              value={selectedTypeId}
              onValueChange={(v) => {
                setSelectedTypeId(v);
                setValue("typeId", v, { shouldValidate: true });
              }}
            >
              <SelectTrigger id="typeId" className={cn(errors.typeId && "border-destructive")}>
                <span className={cn("truncate", !selectedTypeId && "text-muted-foreground")}>
                  {typeLabel}
                </span>
              </SelectTrigger>
              <SelectContent>
                {assetTypes.map((at) => (
                  <SelectItem key={at.id} value={at.id}>{at.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.typeId && <p className="text-xs text-destructive">{errors.typeId.message}</p>}
          </div>

          {/* Manufacturer */}
          <div className="space-y-1">
            <Label htmlFor="manufacturerId">{tField("manufacturer")}</Label>
            <Select
              value={selectedMfgId}
              onValueChange={(v) => {
                setSelectedMfgId(v);
                setValue("manufacturerId", v, { shouldValidate: true });
              }}
            >
              <SelectTrigger id="manufacturerId">
                <span className={cn("truncate", !selectedMfgId && "text-muted-foreground")}>
                  {mfgLabel}
                </span>
              </SelectTrigger>
              <SelectContent>
                {manufacturers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Model */}
          <div className="space-y-1 relative">
            <Label htmlFor="model">{tField("model")} <span className="text-destructive">*</span></Label>
            <ModelAutocomplete
              id="model"
              value={modelIdValue}
              typeId={selectedTypeId}
              manufacturerId={selectedMfgId}
              placeholder={t("modelPlaceholder")}
              error={!!errors.modelId}
              emptyLabel={t("modelNoneForScope")}
              noMatchLabel={(v) => t("modelNoResults", { value: v })}
              onChange={(modelId) => setValue("modelId", modelId, { shouldValidate: true })}
            />
            {errors.modelId && <p className="text-xs text-destructive">{errors.modelId.message}</p>}
          </div>

          {/* Storage location */}
          <div className="space-y-1">
            <Label htmlFor="stock-item-location-search">{t("location")}</Label>
            <p className="text-[12px] text-[#64748b]">{locationLabel}</p>
            <StockLocationPicker
              locations={locations}
              selectedId={selectedLocationId}
              onSelect={(locationId) => {
                setSelectedLocationId(locationId);
                setValue("locationId", locationId, { shouldValidate: true });
              }}
              placeholder={t("selectLocation")}
              showAllLabel={t("showAllLocations")}
              unassignedLabel={t("unassigned")}
              idPrefix="stock-item"
              listClassName="max-h-36"
            />
          </div>

          {/* Serial + Quantity row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="serialNumber">{tField("serialNumber")}</Label>
              <Input
                id="serialNumber"
                {...register("serialNumber")}
                placeholder={t("serialOptional")}
                className={cn("font-mono text-[12.5px]", errors.serialNumber && "border-destructive")}
                onChange={(e) => {
                  register("serialNumber").onChange(e);
                  trigger("quantity");
                }}
              />
              {errors.serialNumber && <p className="text-xs text-destructive">{errors.serialNumber.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="quantity">{t("quantity")} <span className="text-destructive">*</span></Label>
              <Input
                id="quantity"
                type="number"
                min={1}
                {...register("quantity", { valueAsNumber: true })}
                disabled={!!serialNumber?.trim()}
                className={cn(errors.quantity && "border-destructive")}
              />
              {errors.quantity && <p className="text-xs text-destructive">{errors.quantity.message}</p>}
            </div>
          </div>

          <MacAddressFields
            fields={macFields}
            register={register}
            errors={errors.macAddresses}
            onAdd={() => appendMac({ address: "" })}
            onRemove={removeMac}
          />

          {/* Invoice */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="invoiceNumber">{tField("invoiceNumber")}</Label>
              <Input id="invoiceNumber" {...register("invoiceNumber")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="invoiceDate">{tField("invoiceDate")}</Label>
              <Input id="invoiceDate" type="date" {...register("invoiceDate")} />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label htmlFor="notes">{tField("notes")}</Label>
            <Textarea id="notes" {...register("notes")} rows={3} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={handleClose} disabled={isSubmitting}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting} className="bg-[#1e64c8] hover:bg-[#1a56b0] text-white">
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              {mode === "create" ? t("createSubmit") : t("updateSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
