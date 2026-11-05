"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-client";
import { useApiErrorToast } from "@/components/ui/use-api-error-toast";

export type ModelOption = {
  id: string;
  name: string;
  typeId: string;
  manufacturerId: string | null;
};

type Props = {
  id?: string;
  value: string | undefined;
  typeId?: string;
  manufacturerId?: string;
  placeholder?: string;
  error?: boolean;
  className?: string;
  emptyLabel: string;
  noMatchLabel: (value: string) => string;
  onChange: (modelId: string, option: ModelOption | null) => void;
} & Pick<React.InputHTMLAttributes<HTMLInputElement>, "aria-required" | "aria-invalid" | "aria-describedby">;

/**
 * Strict picker over the fixed Model list, scoped by type/manufacturer when
 * given. There is no "create new" option — models are admin-managed (see /admin/models); an asset/stock item with
 * unlisted hardware blocks here until an admin adds the model first.
 */
export function ModelAutocomplete({
  id,
  value,
  typeId,
  manufacturerId,
  placeholder,
  error,
  className,
  emptyLabel,
  noMatchLabel,
  onChange,
  ...aria
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [models, setModels] = useState<ModelOption[]>([]);
  const showApiError = useApiErrorToast();

  // Scoped option list, fetched independently of the search text so typing
  // never re-triggers a request — fetched fresh whenever the scope changes.
  // A failed load is toasted and empties the list, so no out-of-scope model stays offered.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams();
      if (typeId) params.set("typeId", typeId);
      if (manufacturerId) params.set("manufacturerId", manufacturerId);
      const res = await apiFetch<ModelOption[]>(`/api/models?${params}`);
      if (cancelled) return;
      if (!res.ok) {
        setModels([]);
        showApiError(res.error);
        return;
      }
      setModels(res.data);
    })();
    return () => { cancelled = true; };
  }, [typeId, manufacturerId, showApiError]);

  // Keep the visible search text in sync with the selected model's name
  // (handles edit mode, where `value` arrives before the user has typed
  // anything) — same pattern as ManufacturerAutocomplete.
  useEffect(() => {
    const m = models.find((x) => x.id === value);
    setSearch(m ? m.name : "");
  }, [value, models]);

  const filtered = models.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="relative">
      <Input
        id={id}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setOpen(true);
          onChange("", null);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder={placeholder}
        autoComplete="off"
        className={cn(className, error && "border-destructive")}
        {...aria}
      />
      {open && (
        <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md overflow-hidden max-h-48 overflow-y-auto">
          {models.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">{emptyLabel}</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">{noMatchLabel(search)}</div>
          ) : (
            filtered.map((m) => (
              <button
                key={m.id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                onMouseDown={() => {
                  onChange(m.id, m);
                  setSearch(m.name);
                  setOpen(false);
                }}
              >
                {m.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
