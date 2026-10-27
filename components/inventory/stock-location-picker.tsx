"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { LocationOptionButton } from "@/components/inventory/location-search-list";
import type { FlatLocation } from "@/lib/location-tree";
import { cn } from "@/lib/utils";

type Props = {
  locations: FlatLocation[];
  /** Selected location id; "" means none (or "unassigned" when that row is shown). */
  selectedId: string;
  onSelect: (locationId: string) => void;
  placeholder: string;
  showAllLabel: string;
  /** Prefix for the search/checkbox element ids, unique per dialog. */
  idPrefix: string;
  /** Shown when nothing matches; ignored when `unassignedLabel` adds a fixed first row. */
  emptyText?: string;
  /** Adds a first row that clears the selection. */
  unassignedLabel?: string;
  listClassName?: string;
};

/**
 * Storage-location picker for stock: by default only locations that already
 * hold stock (plus the current selection) are listed, with a toggle to show all.
 */
export function StockLocationPicker({
  locations,
  selectedId,
  onSelect,
  placeholder,
  showAllLabel,
  idPrefix,
  emptyText,
  unassignedLabel,
  listClassName = "max-h-40",
}: Props) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const visible = locations
    .filter((l) => showAll || l.hasStock || l.id === selectedId)
    .filter((l) => l.breadcrumb.toLowerCase().includes(query.toLowerCase()));

  return (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#94a3b8]" />
        <Input
          id={`${idPrefix}-location-search`}
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8 h-9 text-[13px]"
        />
      </div>
      <label htmlFor={`${idPrefix}-show-all-locations`} className="flex items-center gap-1.5 text-[12px] text-[#64748b] cursor-pointer">
        <Checkbox id={`${idPrefix}-show-all-locations`} checked={showAll} onCheckedChange={(v) => setShowAll(v === true)} />
        {showAllLabel}
      </label>
      <div className={cn("border border-[#e2e8f0] rounded-[8px] overflow-y-auto", listClassName)}>
        {!unassignedLabel && visible.length === 0 ? (
          <div className="flex items-center justify-center h-16 text-[12.5px] text-[#94a3b8]">{emptyText}</div>
        ) : (
          <ul className="divide-y divide-[#f1f5f9]">
            {unassignedLabel && (
              <li>
                <button
                  type="button"
                  onClick={() => onSelect("")}
                  className={cn(
                    "w-full text-left px-3 py-2 text-[12.5px] transition-colors",
                    !selectedId ? "bg-[#e8f0fc] text-[#1e64c8]" : "hover:bg-[#f8fafc] text-[#64748b]"
                  )}
                >
                  {unassignedLabel}
                </button>
              </li>
            )}
            {visible.map((loc) => (
              <li key={loc.id}>
                <LocationOptionButton location={loc} selected={selectedId === loc.id} onClick={() => onSelect(loc.id)} compact />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
