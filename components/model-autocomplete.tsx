"use client";

import { useEffect, useState } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Command, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { normalizeModelName } from "@/lib/model-similarity";
import { cn } from "@/lib/utils";

export type ModelSuggestion = {
  model: string;
  typeId: string | null;
  manufacturerId: string | null;
};

type Props = {
  id?: string;
  registered: UseFormRegisterReturn;
  value: string | undefined;
  typeId?: string;
  manufacturerId?: string;
  placeholder?: string;
  error?: boolean;
  className?: string;
  createLabel: (value: string) => string;
  noResultsLabel: (value: string) => string;
  onSelect?: (suggestion: ModelSuggestion) => void;
  onBlur?: () => void;
} & Pick<React.InputHTMLAttributes<HTMLInputElement>, "aria-required" | "aria-invalid" | "aria-describedby">;

/**
 * Combobox for the free-text Asset/StockItem "model" field: typing shows
 * existing spellings (scoped by type/manufacturer when given) fetched from
 * /api/models, picking one locks in the exact stored spelling, and an
 * explicit "Create ..." option is offered when nothing matches — so
 * creating a new spelling is a deliberate action rather than a typo.
 */
export function ModelAutocomplete({
  id,
  registered,
  value,
  typeId,
  manufacturerId,
  placeholder,
  error,
  className,
  createLabel,
  noResultsLabel,
  onSelect,
  onBlur,
  ...aria
}: Props) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<ModelSuggestion[]>([]);

  const trimmed = (value ?? "").trim();

  useEffect(() => {
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ q: trimmed });
      if (typeId) params.set("typeId", typeId);
      if (manufacturerId) params.set("manufacturerId", manufacturerId);
      const res = await fetch(`/api/models?${params}`);
      if (res.ok) setSuggestions(await res.json());
    }, 300);
    return () => clearTimeout(timer);
  }, [trimmed, typeId, manufacturerId]);

  const norm = normalizeModelName(trimmed);
  const showCreateOption =
    trimmed.length > 0 && norm.length > 0 && !suggestions.some((s) => normalizeModelName(s.model) === norm);

  function pick(s: ModelSuggestion) {
    onSelect?.(s);
    setOpen(false);
  }

  return (
    <Popover open={open}>
      <PopoverAnchor asChild>
        <Input
          id={id}
          {...registered}
          value={value ?? ""}
          placeholder={placeholder}
          autoComplete="off"
          className={cn(className, error && "border-destructive")}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setTimeout(() => setOpen(false), 200);
            onBlur?.();
          }}
          {...aria}
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command shouldFilter={false}>
          <CommandList>
            <CommandEmpty>{noResultsLabel(trimmed)}</CommandEmpty>
            <CommandGroup>
              {suggestions.map((s) => (
                <CommandItem key={s.model} value={s.model} onSelect={() => pick(s)}>
                  {s.model}
                </CommandItem>
              ))}
              {showCreateOption && (
                <CommandItem value={`__create__${trimmed}`} onSelect={() => setOpen(false)}>
                  {createLabel(trimmed)}
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
