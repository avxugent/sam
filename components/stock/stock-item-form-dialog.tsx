"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { ModelAutocomplete } from "@/components/model-autocomplete";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { normalizeMacAddress, formatMacInputValue } from "@/lib/mac-address";
import { Loader2, MapPin, Search, ChevronRight } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

type FormData = {
  typeId: string;
  manufacturerId?: string;
  model: string;
  serialNumber?: string;
  quantity: number;
  notes?: string;
  locationId?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  macAddress?: string;
};

type AssetType = { id: string; name: string };
type Manufacturer = { id: string; name: string };

type LocationNode = {
  id: string;
  name: string;
  parentId: string | null;
  children?: LocationNode[];
  _count?: { stockItems: number };
};

type FlatLocation = { id: string; name: string; breadcrumb: string; hasStock: boolean };

function flattenLocations(nodes: LocationNode[], ancestors: string[] = []): FlatLocation[] {
  const result: FlatLocation[] = [];
  for (const node of nodes) {
    const path = [...ancestors, node.name];
    result.push({
      id: node.id,
      name: node.name,
      breadcrumb: path.join(" › "),
      hasStock: (node._count?.stockItems ?? 0) > 0,
    });
    if (node.children?.length) result.push(...flattenLocations(node.children, path));
  }
  return result;
}

export type StockItemInitialData = {
  typeId: string;
  typeName: string;
  manufacturerId: string | null;
  manufacturerName: string | null;
  model: string;
  serialNumber: string | null;
  quantity: number;
  notes: string | null;
  locationId: string | null;
  locationBreadcrumb: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  macAddress: string | null;
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
    model: z.string().min(1, t("errModelRequired")).max(255),
    serialNumber: z.string().max(100).optional(),
    quantity: z.number().int().min(1, t("errQuantityMin")),
    notes: z.string().max(5000).optional(),
    locationId: z.string().optional(),
    invoiceNumber: z.string().max(100).optional(),
    invoiceDate: z.string().optional(),
    macAddress: z
      .string()
      .refine((v) => v === "" || normalizeMacAddress(v) !== null, t("errMacInvalid"))
      .optional(),
  }).superRefine((data, ctx) => {
    if (data.serialNumber?.trim() && data.quantity > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["quantity"],
        message: t("errQuantitySerial"),
      });
    }
  }), [t]);

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [locations, setLocations] = useState<FlatLocation[]>([]);
  const [locationQuery, setLocationQuery] = useState("");
  const [showAllLocations, setShowAllLocations] = useState(false);
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
  } = useForm<FormData>({
    resolver: zodResolver(validationSchema),
    defaultValues: {
      quantity: initialData?.quantity ?? 1,
      typeId: initialData?.typeId ?? "",
      manufacturerId: initialData?.manufacturerId ?? "",
      model: initialData?.model ?? "",
      serialNumber: initialData?.serialNumber ?? "",
      notes: initialData?.notes ?? "",
      locationId: initialData?.locationId ?? "",
      invoiceNumber: initialData?.invoiceNumber ?? "",
      invoiceDate: initialData?.invoiceDate ?? "",
      macAddress: initialData?.macAddress ?? "",
    },
  });

  const serialNumber = useWatch({ control, name: "serialNumber" });
  const modelValue = useWatch({ control, name: "model" });

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
    Promise.all([
      fetch("/api/asset-types").then((r) => r.json()),
      fetch("/api/manufacturers").then((r) => r.json()),
      fetch("/api/locations").then((r) => r.json()),
    ]).then(([types, mfrs, locTree]) => {
      setAssetTypes(types as AssetType[]);
      setManufacturers(mfrs as Manufacturer[]);
      setLocations(flattenLocations(locTree as LocationNode[]));
    });
  }, [open]);

  function handleClose() {
    setOpen(false);
    if (mode === "create") {
      reset({ quantity: 1, typeId: "", manufacturerId: "", model: "", serialNumber: "", notes: "", locationId: "", invoiceNumber: "", invoiceDate: "", macAddress: "" });
      setSelectedTypeId("");
      setSelectedMfgId("");
      setSelectedLocationId("");
      setLocationQuery("");
      setShowAllLocations(false);
    }
  }

  async function onSubmit(data: FormData) {
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
        macAddress: data.macAddress?.trim() || null,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      toast({ title: tCommon("error"), description: err.error, variant: "destructive" });
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

  const filteredLocations = locations
    .filter((l) => showAllLocations || l.hasStock || l.id === selectedLocationId)
    .filter((l) => l.breadcrumb.toLowerCase().includes(locationQuery.toLowerCase()));

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
              registered={register("model")}
              value={modelValue}
              typeId={selectedTypeId}
              manufacturerId={selectedMfgId}
              placeholder={t("modelPlaceholder")}
              error={!!errors.model}
              createLabel={(v) => t("createModelOption", { value: v })}
              noResultsLabel={(v) => t("modelNoResults", { value: v })}
              onSelect={(s) => setValue("model", s.model, { shouldValidate: true })}
            />
            {errors.model && <p className="text-xs text-destructive">{errors.model.message}</p>}
          </div>

          {/* Storage location */}
          <div className="space-y-1">
            <Label htmlFor="locationSearch">{t("location")}</Label>
            <p className="text-[12px] text-[#64748b]">{locationLabel}</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#94a3b8]" />
              <Input
                id="locationSearch"
                placeholder={t("selectLocation")}
                value={locationQuery}
                onChange={(e) => setLocationQuery(e.target.value)}
                className="pl-8 h-9 text-[13px]"
              />
            </div>
            <label htmlFor="showAllLocations" className="flex items-center gap-1.5 text-[12px] text-[#64748b] cursor-pointer">
              <Checkbox
                id="showAllLocations"
                checked={showAllLocations}
                onCheckedChange={(v) => setShowAllLocations(v === true)}
              />
              {t("showAllLocations")}
            </label>
            <div className="border border-[#e2e8f0] rounded-[8px] overflow-y-auto max-h-36">
              <ul className="divide-y divide-[#f1f5f9]">
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedLocationId("");
                      setValue("locationId", "", { shouldValidate: true });
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2 text-[12.5px] transition-colors",
                      !selectedLocationId ? "bg-[#e8f0fc] text-[#1e64c8]" : "hover:bg-[#f8fafc] text-[#64748b]"
                    )}
                  >
                    {t("unassigned")}
                  </button>
                </li>
                {filteredLocations.map((loc) => {
                  const parts = loc.breadcrumb.split(" › ");
                  const isSelected = selectedLocationId === loc.id;
                  return (
                    <li key={loc.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedLocationId(loc.id);
                          setValue("locationId", loc.id, { shouldValidate: true });
                        }}
                        className={cn(
                          "w-full text-left px-3 py-2 flex items-center gap-1.5 transition-colors",
                          isSelected ? "bg-[#e8f0fc] text-[#1e64c8]" : "hover:bg-[#f8fafc] text-[#0f172a]"
                        )}
                      >
                        <MapPin className={cn("h-3 w-3 flex-shrink-0", isSelected ? "text-[#1e64c8]" : "text-[#94a3b8]")} />
                        <span className="flex items-center gap-1 text-[12.5px] flex-wrap">
                          {parts.map((part, i) => (
                            <span key={i} className="flex items-center gap-1">
                              {i > 0 && <ChevronRight className="h-2.5 w-2.5 opacity-40" />}
                              <span className={i === parts.length - 1 ? "font-medium" : "text-[#64748b]"}>{part}</span>
                            </span>
                          ))}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
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

          {/* MAC address */}
          <div className="space-y-1">
            <Label htmlFor="macAddress">{tField("macAddress")}</Label>
            <Input
              id="macAddress"
              {...register("macAddress", {
                onChange: (e) => {
                  e.target.value = formatMacInputValue(e.target.value);
                },
              })}
              placeholder="AA:BB:CC:DD:EE:FF"
              className={cn("font-mono text-[12.5px]", errors.macAddress && "border-destructive")}
              autoComplete="off"
            />
            {errors.macAddress && <p className="text-xs text-destructive">{errors.macAddress.message}</p>}
          </div>

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
