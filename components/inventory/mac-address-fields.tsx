"use client";

import { useTranslations } from "next-intl";
import type { FieldErrors, Path, UseFormRegister } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMacInputValue } from "@/lib/mac-address";
import { cn } from "@/lib/utils";

type MacFormValues = { macAddresses: { address: string }[] };

type Props<T extends MacFormValues> = {
  /** `fields` from the parent's useFieldArray({ name: "macAddresses" }). */
  fields: { id: string }[];
  register: UseFormRegister<T>;
  errors?: FieldErrors<MacFormValues>["macAddresses"];
  onAdd: () => void;
  onRemove: (index: number) => void;
  /** Show the required marker next to the label. */
  required?: boolean;
  helpText?: string;
  /** Form-level error for the whole list (e.g. hostname set but no MAC). */
  listError?: string;
};

/** Editable list of MAC addresses, auto-formatted as AA:BB:CC:DD:EE:FF while typing. */
export function MacAddressFields<T extends MacFormValues>({
  fields,
  register,
  errors,
  onAdd,
  onRemove,
  required,
  helpText,
  listError,
}: Props<T>) {
  const t = useTranslations("macAddressFields");
  const tField = useTranslations("field");

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <Label>
            {tField("macAddresses")}
            {required && <span className="ml-1.5 text-destructive text-xs">*</span>}
          </Label>
          {helpText && <p className="text-xs text-muted-foreground mt-0.5">{helpText}</p>}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          {t("add")}
        </Button>
      </div>

      {fields.map((field, i) => (
        <div key={field.id} className="flex gap-2">
          <Input
            {...register(`macAddresses.${i}.address` as Path<T>, {
              onChange: (e) => {
                e.target.value = formatMacInputValue(e.target.value);
              },
            })}
            aria-label={`${tField("macAddress")} ${i + 1}`}
            aria-invalid={!!errors?.[i]?.address}
            aria-describedby={errors?.[i]?.address ? `mac-err-${i}` : undefined}
            placeholder={t("placeholder")}
            autoComplete="off"
            className={cn("font-mono", errors?.[i]?.address && "border-destructive")}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("removeAriaLabel", { n: i + 1 })}
            onClick={() => onRemove(i)}
            className="text-destructive hover:text-destructive flex-shrink-0"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}

      {fields.map((field, i) =>
        errors?.[i]?.address ? (
          <p key={`mac-err-${field.id}`} id={`mac-err-${i}`} className="text-xs text-destructive -mt-1">
            {t("entryLabel", { n: i + 1 })} {errors[i]?.address?.message}
          </p>
        ) : null
      )}

      {listError && <p className="text-xs text-destructive">{listError}</p>}
    </div>
  );
}
