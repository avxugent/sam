"use client";

import { useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Hash } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

// FI number: CC.BB.FFF.RRR  e.g. "14.10.100.013"
const FI_REGEX = /^\d{2}\.\d{2}\.\d{3}\.\d{3}$/;

const schema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().max(2000).optional(),
  fiNumber: z
    .string()
    .regex(FI_REGEX, "Format: CC.BB.FFF.RRR (e.g. 14.10.100.013)")
    .optional()
    .or(z.literal("")),
  address: z.string().max(500).optional(),
  city: z.string().max(255).optional(),
  country: z.string().max(100).optional(),
});

type FormData = z.infer<typeof schema>;

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

/**
 * Decodes an FI number into human-readable segment labels.
 * Returns null if the number is not fully formed.
 */
function parseFiNumber(fi: string): { campus: string; building: string; floor: string; room: string } | null {
  if (!FI_REGEX.test(fi)) return null;
  const [campus, building, floor, room] = fi.split(".");
  return { campus, building, floor, room };
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
  const [open, setOpen] = useState(false);
  const [fiRaw, setFiRaw] = useState(initialData?.fiNumber || "");

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initialData?.name || "",
      description: initialData?.description || "",
      fiNumber: initialData?.fiNumber || "",
      address: initialData?.address || "",
      city: initialData?.city || "",
      country: initialData?.country || "",
    },
  });

  const fiValue = useWatch({ control, name: "fiNumber" }) ?? "";
  const parsedFi = parseFiNumber(fiValue);

  function handleFiInput(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = autoFormatFiNumber(e.target.value);
    setFiRaw(formatted);
    setValue("fiNumber", formatted, { shouldValidate: true });
  }

  async function onSubmit(data: FormData) {
    const url =
      mode === "create" ? "/api/locations" : `/api/locations/${locationId}`;
    const method = mode === "create" ? "POST" : "PUT";

    const payload = {
      ...data,
      parentId,
      fiNumber: data.fiNumber || null,
    };

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json();
      toast({
        title: "Error",
        description: err.error || "Something went wrong.",
        variant: "destructive",
      });
      return;
    }

    toast({ title: mode === "create" ? "Location created" : "Location updated" });
    setOpen(false);
    setFiRaw("");
    reset();
    router.refresh();
    onSuccess?.();
  }

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (v) {
      // Reset form to initial values when reopening
      reset({
        name: initialData?.name || "",
        description: initialData?.description || "",
        fiNumber: initialData?.fiNumber || "",
        address: initialData?.address || "",
        city: initialData?.city || "",
        country: initialData?.country || "",
      });
      setFiRaw(initialData?.fiNumber || "");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Add Location" : "Edit Location"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="loc-name">
              Name <span aria-hidden="true" className="text-destructive">*</span>
            </Label>
            <Input
              id="loc-name"
              aria-required="true"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "loc-name-err" : undefined}
              {...register("name")}
              placeholder="e.g. Lecture Hall 101"
            />
            {errors.name && (
              <p id="loc-name-err" className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="loc-desc">Description</Label>
            <Textarea
              id="loc-desc"
              {...register("description")}
              placeholder="Optional description"
              rows={2}
            />
          </div>

          {/* FI Number */}
          <div className="space-y-1.5">
            <Label htmlFor="loc-fi" className="flex items-center gap-1.5">
              <Hash className="h-3.5 w-3.5 text-muted-foreground" />
              FI Number
              <span className="text-xs text-muted-foreground font-normal ml-1">
                (optional)
              </span>
            </Label>
            <Input
              id="loc-fi"
              value={fiRaw}
              onChange={handleFiInput}
              placeholder="14.10.100.013"
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
                  <span className="font-medium text-foreground">Campus:</span>{" "}
                  {parsedFi.campus}
                </span>
                <span>
                  <span className="font-medium text-foreground">Building:</span>{" "}
                  {parsedFi.building}
                </span>
                <span>
                  <span className="font-medium text-foreground">Floor:</span>{" "}
                  {parsedFi.floor}
                </span>
                <span>
                  <span className="font-medium text-foreground">Room:</span>{" "}
                  {parsedFi.room}
                </span>
              </div>
            )}
            {!parsedFi && fiRaw.length > 0 && !errors.fiNumber && (
              <p className="text-xs text-muted-foreground">
                Keep typing — format: CC.BB.FFF.RRR
              </p>
            )}
          </div>

          {/* Address section */}
          <div className="pt-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Address (optional)
            </p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="loc-address">Street address</Label>
                <Input
                  id="loc-address"
                  {...register("address")}
                  placeholder="e.g. Grote Markt 1"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="loc-city">City</Label>
                  <Input
                    id="loc-city"
                    {...register("city")}
                    placeholder="e.g. Ghent"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="loc-country">Country</Label>
                  <Input
                    id="loc-country"
                    {...register("country")}
                    placeholder="e.g. Belgium"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "create" ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
