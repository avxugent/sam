"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { MapPin, ChevronRight, ChevronDown, Search, FolderOpen, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type LocationNode = {
  id: string;
  name: string;
  fiNumber: string | null;
  children: LocationNode[];
};

function nodeMatchesFilter(node: LocationNode, query: string): boolean {
  if (node.name.toLowerCase().includes(query)) return true;
  return node.children.some((c) => nodeMatchesFilter(c, query));
}

function LocationTreeItem({
  location,
  depth,
  assetCountMap,
  filterQuery,
}: {
  location: LocationNode;
  depth: number;
  assetCountMap: Record<string, number>;
  filterQuery: string;
}) {
  const pathname = usePathname();
  const isActive =
    pathname === `/locations/${location.id}` ||
    pathname.startsWith(`/locations/${location.id}/`);
  const hasChildren = location.children.length > 0;

  const isFiltering = filterQuery.length > 0;
  const selfMatches = isFiltering && location.name.toLowerCase().includes(filterQuery);
  const childMatches =
    isFiltering &&
    !selfMatches &&
    location.children.some((c) => nodeMatchesFilter(c, filterQuery));

  if (isFiltering && !selfMatches && !childMatches) return null;

  const forceOpen = isFiltering && (selfMatches || childMatches);
  const [open, setOpen] = useState(isActive || forceOpen);
  const totalAssets = assetCountMap[location.id] ?? 0;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 py-[10px] text-[14px] rounded-[8px] transition-colors",
          isActive
            ? "bg-[#e8f0fc] text-[#1e64c8] font-semibold"
            : "text-[#334155] hover:bg-[#f8fafc] active:bg-[#f1f5f9]"
        )}
        style={{ paddingLeft: `${12 + depth * 20}px`, paddingRight: "12px" }}
      >
        {/* Expand/collapse button — larger hit target for touch */}
        <button
          type="button"
          className="flex-shrink-0 h-8 w-8 flex items-center justify-center rounded-[6px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e64c8]"
          onClick={() => setOpen((v) => !v)}
          aria-label={(forceOpen || open) ? `Collapse ${location.name}` : `Expand ${location.name}`}
          aria-expanded={hasChildren ? (forceOpen || open) : undefined}
          disabled={!hasChildren}
        >
          {hasChildren ? (
            (forceOpen || open)
              ? <ChevronDown className={cn("h-4 w-4", isActive ? "stroke-[#1e64c8]" : "stroke-[#94a3b8]")} />
              : <ChevronRight className={cn("h-4 w-4", isActive ? "stroke-[#1e64c8]" : "stroke-[#94a3b8]")} />
          ) : (
            <span className="h-4 w-4" />
          )}
        </button>

        {/* Location link — takes most of the row */}
        <Link
          href={`/locations/${location.id}`}
          className="flex-1 flex items-center gap-2 min-w-0"
        >
          <MapPin
            className={cn(
              "h-4 w-4 flex-shrink-0",
              isActive ? "fill-[#1e64c8] stroke-[#1e64c8]" : "stroke-[#94a3b8]"
            )}
          />
          <div className="min-w-0">
            <span className="truncate block">
              {selfMatches ? (
                <mark className="bg-yellow-100 text-inherit rounded-[2px]">{location.name}</mark>
              ) : (
                location.name
              )}
            </span>
            {location.fiNumber && (
              <span className="text-[11px] text-[#94a3b8] font-mono block truncate">
                {location.fiNumber}
              </span>
            )}
          </div>
        </Link>

        {totalAssets > 0 && (
          <span className="text-[12px] text-[#64748b] bg-[#f1f5f9] px-2 py-0.5 rounded-[5px] flex-shrink-0">
            {totalAssets}
          </span>
        )}
      </div>

      {(forceOpen || open) && hasChildren && (
        <div>
          {location.children.map((child) => (
            <LocationTreeItem
              key={child.id}
              location={child}
              depth={depth + 1}
              assetCountMap={assetCountMap}
              filterQuery={filterQuery}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function LocationBrowserClient({
  locationTree,
  assetCountMap,
}: {
  locationTree: LocationNode[];
  assetCountMap: Record<string, number>;
}) {
  const t = useTranslations("nav");
  const [filter, setFilter] = useState("");
  const query = filter.toLowerCase().trim();

  return (
    <div className="space-y-3">
      {/* Search/filter */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8]" />
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("filterLocations")}
          className="pl-9 h-10 text-[14px]"
        />
        {filter && (
          <button
            type="button"
            onClick={() => setFilter("")}
            aria-label="Clear filter"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#334155]"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Tree */}
      <div className="bg-white border border-[#e2e8f0] rounded-[10px] overflow-hidden">
        {locationTree.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-[#64748b]">
            <FolderOpen className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-[14px]">{t("noLocationsYet")}</p>
          </div>
        ) : (
          <div className="py-1">
            {locationTree.map((loc) =>
              query && !nodeMatchesFilter(loc, query) ? null : (
                <LocationTreeItem
                  key={loc.id}
                  location={loc}
                  depth={0}
                  assetCountMap={assetCountMap}
                  filterQuery={query}
                />
              )
            )}
            {query && locationTree.every((loc) => !nodeMatchesFilter(loc, query)) && (
              <p className="text-[13px] text-[#94a3b8] text-center py-6">
                {t("noLocationsMatch")}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
