"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { MapPin, ChevronRight, ChevronDown, Search, FolderOpen, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { subtreeMatchesFilter, treeFilterState, type Nested } from "@/lib/locations/tree";

type LocationNode = Nested<{ id: string; name: string; fiNumber: string | null }>;

function LocationTreeItem({
  location,
  depth,
  assetCountMap,
  filterQuery,
  insideMatch = false,
}: {
  location: LocationNode;
  depth: number;
  assetCountMap: Record<string, number>;
  filterQuery: string;
  insideMatch?: boolean;
}) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const isActive =
    pathname === `/locations/${location.id}` ||
    pathname.startsWith(`/locations/${location.id}/`);
  const hasChildren = location.children.length > 0;

  const filter = treeFilterState(location, filterQuery, insideMatch);
  const { matches: selfMatches, forceOpen } = filter;
  const [open, setOpen] = useState(isActive || forceOpen);

  if (!filter.visible) return null;
  const expanded = forceOpen || open || insideMatch;
  const totalAssets = assetCountMap[location.id] ?? 0;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 py-[10px] text-[14px] rounded-[8px] transition-colors",
          isActive
            ? "bg-primary-tint text-primary font-semibold"
            : "text-secondary-foreground hover:bg-background active:bg-muted"
        )}
        style={{ paddingLeft: `${12 + depth * 20}px`, paddingRight: "12px" }}
      >
        {/* Expand/collapse button — larger hit target for touch */}
        <button
          type="button"
          className="flex-shrink-0 h-8 w-8 flex items-center justify-center rounded-[6px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          onClick={() => setOpen((v) => !v)}
          aria-label={expanded ? t("collapseLocation", { name: location.name }) : t("expandLocation", { name: location.name })}
          aria-expanded={hasChildren ? expanded : undefined}
          disabled={!hasChildren}
        >
          {hasChildren ? (
            expanded
              ? <ChevronDown className={cn("h-4 w-4", isActive ? "stroke-primary" : "stroke-subtle")} />
              : <ChevronRight className={cn("h-4 w-4", isActive ? "stroke-primary" : "stroke-subtle")} />
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
              isActive ? "fill-primary stroke-primary" : "stroke-subtle"
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
              <span className="text-[11px] text-subtle font-mono block truncate">
                {location.fiNumber}
              </span>
            )}
          </div>
        </Link>

        {totalAssets > 0 && (
          <span className="text-[12px] text-muted-foreground bg-muted px-2 py-0.5 rounded-[5px] flex-shrink-0">
            {totalAssets}
          </span>
        )}
      </div>

      {expanded && hasChildren && (
        <div>
          {location.children.map((child) => (
            <LocationTreeItem
              key={child.id}
              location={child}
              depth={depth + 1}
              assetCountMap={assetCountMap}
              filterQuery={filterQuery}
              insideMatch={filter.childrenInsideMatch}
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
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-subtle" />
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
            aria-label={t("clearLocationFilter")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle hover:text-secondary-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="bg-card border border-border rounded-[10px] overflow-hidden">
        {locationTree.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <FolderOpen className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-[14px]">{t("noLocationsYet")}</p>
          </div>
        ) : (
          <div className="py-1">
            {locationTree.map((loc) =>
              query && !subtreeMatchesFilter(loc, query) ? null : (
                <LocationTreeItem
                  key={loc.id}
                  location={loc}
                  depth={0}
                  assetCountMap={assetCountMap}
                  filterQuery={query}
                />
              )
            )}
            {query && locationTree.every((loc) => !subtreeMatchesFilter(loc, query)) && (
              <p className="text-[13px] text-subtle text-center py-6">
                {t("noLocationsMatch")}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
