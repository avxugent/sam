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
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

// IEEE 802 MAC address — colon, hyphen, or dot-separated, upper or lower case.
const MAC_REGEX =
  /^([0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}$|^([0-9A-Fa-f]{4}\.){2}[0-9A-Fa-f]{4}$/;

type FormData = {
  typeId: string;
  manufacturerId?: string;
  model: string;
  serialNumber?: string;
  quantity: number;
  notes?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  macAddress?: string;
};

type AssetType = { id: string; name: string };
type Manufacturer = { id: string; name: string };

export type StockItemInitialData = {
  typeId: string;
  typeName: string;
  manufacturerId: string | null;
  manufacturerName: string | null;
  model: string;
  serialNumber: string | null;
  quantity: number;
  notes: string | null;
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
    invoiceNumber: z.string().max(100).optional(),
    invoiceDate: z.string().optional(),
    macAddress: z
      .string()
      .regex(MAC_REGEX, t("errMacInvalid"))
      .optional()
      .or(z.literal("")),
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
  // Initialised synchronously from prop so the value is ready before any fetch completes
  const [selectedTypeId, setSelectedTypeId] = useState(initialData?.typeId ?? "");
  const [selectedMfgId, setSelectedMfgId] = useState(initialData?.manufacturerId ?? "");

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
    ]).then(([types, mfrs]) => {
      setAssetTypes(types as AssetType[]);
      setManufacturers(mfrs as Manufacturer[]);
    });
  }, [open]);

  function handleClose() {
    setOpen(false);
    if (mode === "create") {
      reset({ quantity: 1, typeId: "", manufacturerId: "", model: "", serialNumber: "", notes: "", invoiceNumber: "", invoiceDate: "", macAddress: "" });
      setSelectedTypeId("");
      setSelectedMfgId("");
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
              {...register("macAddress")}
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
