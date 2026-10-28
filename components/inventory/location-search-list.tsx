"use client";

import type { RefObject } from "react";
import { ChevronRight, Loader2, MapPin, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { FlatLocation } from "@/lib/locations/tree";
import { cn } from "@/lib/utils";

type Props = {
  locations: FlatLocation[];
  loading: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  selectedId: string | null;
  onSelect: (location: FlatLocation) => void;
  placeholder: string;
  emptyText: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  /** Tailwind max-height class for the scrolling list. */
  listClassName?: string;
};

/** One selectable location rendered as its breadcrumb path. */
export function LocationOptionButton({
  location,
  selected,
  onClick,
  compact = false,
}: {
  location: FlatLocation;
  selected: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  const parts = location.breadcrumb.split(" › ");
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 flex items-center transition-colors",
        compact ? "py-2 gap-1.5" : "py-2.5 gap-2",
        selected ? "bg-primary-tint text-primary" : "hover:bg-background text-foreground"
      )}
    >
      <MapPin className={cn("flex-shrink-0", compact ? "h-3 w-3" : "h-3.5 w-3.5", selected ? "text-primary" : "text-subtle")} />
      <span className="flex items-center gap-1 text-[12.5px] flex-wrap">
        {parts.map((part, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className={cn("opacity-40", compact ? "h-2.5 w-2.5" : "h-3 w-3")} />}
            <span className={i === parts.length - 1 ? "font-medium" : "text-muted-foreground"}>{part}</span>
          </span>
        ))}
      </span>
    </button>
  );
}

/** Search box over a flattened location tree, with a single-select breadcrumb list. */
export function LocationSearchList({
  locations,
  loading,
  query,
  onQueryChange,
  selectedId,
  onSelect,
  placeholder,
  emptyText,
  inputRef,
  listClassName = "max-h-64",
}: Props) {
  const filtered = locations.filter((l) => l.breadcrumb.toLowerCase().includes(query.toLowerCase()));

  return (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-subtle" />
        <Input
          ref={inputRef}
          placeholder={placeholder}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          className="pl-8 h-9 text-[13px]"
        />
      </div>

      <div className={cn("border border-border rounded-[8px] overflow-y-auto min-h-[80px]", listClassName)}>
        {loading ? (
          <div className="flex items-center justify-center h-20 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-[13px] text-subtle">{emptyText}</div>
        ) : (
          <ul className="divide-y divide-muted">
            {filtered.map((loc) => (
              <li key={loc.id}>
                <LocationOptionButton location={loc} selected={selectedId === loc.id} onClick={() => onSelect(loc)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
