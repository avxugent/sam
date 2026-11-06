"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ManufacturerOption } from "@/components/inventory/use-type-scoped-manufacturers";

type Props = {
  id?: string;
  value: string | undefined;
  options: ManufacturerOption[];
  placeholder?: string;
  error?: boolean;
  noneLabel: string;
  /** "" when the selection is cleared; `picked` is false while the user is typing. */
  onChange: (manufacturerId: string, picked: boolean) => void;
} & Pick<React.InputHTMLAttributes<HTMLInputElement>, "aria-required" | "aria-invalid" | "aria-describedby" | "aria-label">;

/**
 * Type-to-filter picker over the given manufacturer options (see
 * useTypeScopedManufacturers), with a "none" entry that clears the selection.
 * Same interaction as ModelAutocomplete.
 */
export function ManufacturerAutocomplete({ id, value, options, placeholder, error, noneLabel, onChange, ...aria }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Show the selected manufacturer's name, also when `value` arrives before
  // the options (edit mode).
  useEffect(() => {
    const m = options.find((x) => x.id === value);
    setSearch(m ? m.name : "");
  }, [value, options]);

  const filtered = options.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()));

  const select = (manufacturerId: string, name: string) => {
    onChange(manufacturerId, true);
    setSearch(name);
    setOpen(false);
  };

  return (
    <div className="relative">
      <Input
        id={id}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setOpen(true);
          onChange("", false);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder={placeholder}
        autoComplete="off"
        className={cn(error && "border-destructive")}
        {...aria}
      />
      {open && (
        <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md overflow-hidden max-h-48 overflow-y-auto">
          <button
            type="button"
            className="w-full text-left px-3 py-2 text-sm hover:bg-accent text-muted-foreground"
            onMouseDown={() => select("", "")}
          >
            {noneLabel}
          </button>
          {filtered.map((m) => (
            <button
              key={m.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
              onMouseDown={() => select(m.id, m.name)}
            >
              {m.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
