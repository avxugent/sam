"use client";

import { useState, useEffect, useCallback } from "react";
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
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const schema = z
  .object({
    typeId: z.string().min(1, "Type is required"),
    manufacturerId: z.string().optional(),
    model: z.string().min(1, "Model is required").max(255),
    serialNumber: z.string().max(100).optional(),
    quantity: z.number().int().min(1, "Quantity must be at least 1"),
    notes: z.string().max(5000).optional(),
    invoiceNumber: z.string().max(100).optional(),
    invoiceDate: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.serialNumber?.trim() && data.quantity > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["quantity"],
        message: "Quantity must be 1 when a serial number is set.",
      });
    }
  });

type FormData = z.infer<typeof schema>;
type AssetType = { id: string; name: string };
type Manufacturer = { id: string; name: string };

type Props = {
  mode: "create" | "edit";
  itemId?: string;
  children: React.ReactNode;
  onSuccess?: () => void;
};

export function StockItemFormDialog({ mode, itemId, children, onSuccess }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("stock");
  const tCommon = useTranslations("common");
  const tField = useTranslations("field");
  const [open, setOpen] = useState(false);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [modelSuggestions, setModelSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    trigger,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { quantity: 1 },
  });

  const serialNumber = useWatch({ control, name: "serialNumber" });

  // Lock quantity to 1 when serial is set
  useEffect(() => {
    if (serialNumber?.trim()) {
      setValue("quantity", 1, { shouldValidate: true });
    }
  }, [serialNumber, setValue]);

  // Fetch reference data when dialog opens
  useEffect(() => {
    if (!open) return;
    Promise.all([
      fetch("/api/asset-types").then((r) => r.json()),
      fetch("/api/manufacturers").then((r) => r.json()),
    ]).then(([types, mfrs]) => {
      setAssetTypes(types);
      setManufacturers(mfrs);
    });

    if (mode === "edit" && itemId) {
      fetch(`/api/stock/${itemId}`)
        .then((r) => r.json())
        .then((item) => {
          reset({
            typeId: item.typeId ?? "",
            manufacturerId: item.manufacturerId ?? "",
            model: item.model ?? "",
            serialNumber: item.serialNumber ?? "",
            quantity: item.quantity ?? 1,
            notes: item.notes ?? "",
            invoiceNumber: item.invoiceNumber ?? "",
            invoiceDate: item.invoiceDate
              ? new Date(item.invoiceDate).toISOString().slice(0, 10)
              : "",
          });
        });
    }
  }, [open, mode, itemId, reset]);

  const fetchModelSuggestions = useCallback(async (q: string) => {
    if (!q || q.length < 2) { setModelSuggestions([]); return; }
    const res = await fetch(`/api/models?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    setModelSuggestions(data.models ?? []);
    setShowSuggestions(true);
  }, []);

  function handleClose() {
    setOpen(false);
    if (mode === "create") reset({ quantity: 1 });
    setModelSuggestions([]);
    setShowSuggestions(false);
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
              onValueChange={(v) => { setValue("typeId", v, { shouldValidate: true }); }}
              defaultValue=""
            >
              <SelectTrigger id="typeId" className={cn(errors.typeId && "border-destructive")}>
                <SelectValue placeholder={t("selectType")} />
              </SelectTrigger>
              <SelectContent>
                {assetTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.typeId && <p className="text-xs text-destructive">{errors.typeId.message}</p>}
          </div>

          {/* Manufacturer */}
          <div className="space-y-1">
            <Label htmlFor="manufacturerId">{tField("manufacturer")}</Label>
            <Select
              onValueChange={(v) => setValue("manufacturerId", v, { shouldValidate: true })}
              defaultValue=""
            >
              <SelectTrigger id="manufacturerId">
                <SelectValue placeholder={t("selectManufacturer")} />
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
            <Input
              id="model"
              {...register("model")}
              placeholder={t("modelPlaceholder")}
              className={cn(errors.model && "border-destructive")}
              autoComplete="off"
              onChange={(e) => {
                register("model").onChange(e);
                fetchModelSuggestions(e.target.value);
              }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              onFocus={() => { if (modelSuggestions.length) setShowSuggestions(true); }}
            />
            {errors.model && <p className="text-xs text-destructive">{errors.model.message}</p>}
            {showSuggestions && modelSuggestions.length > 0 && (
              <ul className="absolute z-50 w-full bg-white border border-[#e2e8f0] rounded-md shadow-sm mt-1 max-h-40 overflow-y-auto">
                {modelSuggestions.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-[#f1f5f9]"
                      onMouseDown={() => {
                        setValue("model", s, { shouldValidate: true });
                        setShowSuggestions(false);
                      }}
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            )}
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
