"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, Suspense } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Monitor,
  ChevronRight,
  ChevronDown,
  MapPin,
  Building2,
  Plus,
  Layers,
  Search,
  X,
  Package,
  Wrench,
} from "lucide-react";
import { LocationFormDialog } from "@/components/locations/location-form-dialog";
import { StockNavItems } from "@/components/layout/stock-nav-items";
import * as permissions from "@/lib/permissions";
import type { Role } from "@/lib/permissions";

type LocationNode = {
  id: string;
  name: string;
  inMaintenance?: boolean;
  children: LocationNode[];
};

type StockTypeNode = { id: string; name: string };

type SidebarProps = {
  locationTree: LocationNode[];
  userRole: Role;
  assetCountMap: Record<string, number>;
  stockItemCount?: number;
  stockTypes?: StockTypeNode[];
  decommissionedCount?: number;
  inRepairCount?: number;
  appTitle?: string;
  logoUrl?: string | null;
};

function nodeMatchesFilter(node: LocationNode, query: string): boolean {
  if (node.name.toLowerCase().includes(query)) return true;
  return node.children.some((child) => nodeMatchesFilter(child, query));
}

function LocationTreeItem({
  location,
  depth = 0,
  userRole,
  assetCountMap,
  filterQuery = "",
  showAll = false,
}: {
  location: LocationNode;
  depth?: number;
  userRole: Role;
  assetCountMap: Record<string, number>;
  filterQuery?: string;
  showAll?: boolean;
}) {
  const pathname = usePathname();
  const isActive = pathname === `/locations/${location.id}` || pathname.startsWith(`/locations/${location.id}/`);
  const hasChildren = location.children.length > 0;
  const [open, setOpen] = useState(
    pathname.startsWith(`/locations/${location.id}`)
  );

  const isFiltering = filterQuery.length > 0;
  const selfMatches = isFiltering && !showAll && location.name.toLowerCase().includes(filterQuery);
  const childMatches = isFiltering && !showAll && !selfMatches && location.children.some((c) => nodeMatchesFilter(c, filterQuery));
  const forceOpen = isFiltering && (selfMatches || childMatches);

  if (isFiltering && !showAll && !selfMatches && !childMatches) return null;

  const totalAssets = assetCountMap[location.id] ?? 0;
  const useDot = depth >= 2;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 py-[5px] text-[12.5px] group relative cursor-pointer select-none",
          isActive
            ? "bg-[#e8f0fc] text-[#1e64c8] font-semibold border-r-[3px] border-[#1e64c8]"
            : "text-[#334155] hover:bg-background"
        )}
        style={{ paddingLeft: `${12 + depth * 14}px`, paddingRight: "10px" }}
      >
        <button
          type="button"
          className="flex-shrink-0 h-4 w-4 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e64c8] rounded-sm"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? `Collapse ${location.name}` : `Expand ${location.name}`}
          aria-expanded={hasChildren ? open : undefined}
          disabled={!hasChildren}
        >
          {useDot ? (
            <span className={cn("block w-[5px] h-[5px] rounded-full", isActive ? "bg-[#1e64c8]" : "bg-[#cbd5e1]")} />
          ) : hasChildren ? (
            open
              ? <ChevronDown className={cn("h-3 w-3", isActive ? "stroke-[#1e64c8]" : "stroke-[#94a3b8]")} />
              : <ChevronRight className={cn("h-3 w-3", isActive ? "stroke-[#1e64c8]" : "stroke-[#94a3b8]")} />
          ) : (
            <span className="h-3 w-3" />
          )}
        </button>

        <Link href={`/locations/${location.id}`} className="flex-1 flex items-center gap-1.5 min-w-0">
          <MapPin className={cn("h-3 w-3 flex-shrink-0", isActive ? "fill-[#1e64c8] stroke-[#1e64c8]" : "stroke-[#94a3b8]")} />
          <span className="truncate">
            {selfMatches ? <mark className="bg-yellow-100 text-inherit rounded-[2px]">{location.name}</mark> : location.name}
          </span>
          {location.inMaintenance && (
            <Wrench className="h-3 w-3 flex-shrink-0 stroke-amber-500" aria-label="In maintenance" />
          )}
        </Link>

        {totalAssets > 0 && (
          <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0 rounded flex-shrink-0 leading-5">
            {totalAssets}
          </span>
        )}
      </div>

      {(forceOpen || open || showAll) && hasChildren && (
        <div>
          {location.children.map((child) => (
            <LocationTreeItem
              key={child.id}
              location={child}
              depth={depth + 1}
              userRole={userRole}
              assetCountMap={assetCountMap}
              filterQuery={filterQuery}
              showAll={showAll || selfMatches}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AllLocationsEntry({ totalAssets }: { totalAssets: number }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const isActive = pathname === "/locations";
  return (
    <Link
      href="/locations"
      className={cn(
        "flex items-center gap-1.5 px-3 py-[5px] text-[12.5px] select-none",
        isActive
          ? "bg-[#e8f0fc] text-[#1e64c8] font-semibold border-r-[3px] border-[#1e64c8]"
          : "text-[#334155] hover:bg-background"
      )}
    >
      <Layers className={cn("h-3 w-3 flex-shrink-0", isActive ? "text-[#1e64c8]" : "text-[#94a3b8]")} />
      <span className="flex-1 truncate">{t("allLocations")}</span>
      {totalAssets > 0 && (
        <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0 rounded flex-shrink-0 leading-5">
          {totalAssets}
        </span>
      )}
    </Link>
  );
}


export function Sidebar({ locationTree, userRole, assetCountMap, stockItemCount = 0, stockTypes = [], decommissionedCount = 0, inRepairCount = 0, appTitle = "SAM", logoUrl = null }: SidebarProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const isStockPath = pathname === "/stock" || pathname.startsWith("/stock") || pathname === "/decommissioned" || pathname === "/in-repair";

  const canEdit = permissions.canEdit(userRole);
  const totalAssets = locationTree.reduce((sum, loc) => sum + (assetCountMap[loc.id] ?? 0), 0);
  const [filterQuery, setFilterQuery] = useState("");

  // Mutually exclusive: only one section expanded at a time
  const [locationOpen, setLocationOpen] = useState(!isStockPath);
  const [stockOpen, setStockOpen] = useState(isStockPath);

  const hasStockTypes = stockTypes.length > 0 || decommissionedCount > 0 || inRepairCount > 0;

  function openLocations() {
    setLocationOpen(true);
    setStockOpen(false);
  }

  function openStock() {
    setStockOpen(true);
    setLocationOpen(false);
    setFilterQuery("");
  }

  return (
    <aside className="w-[248px] flex-shrink-0 border-r bg-card flex flex-col h-full overflow-hidden hidden lg:flex">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 h-[56px] border-b flex-shrink-0">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-5 w-5 object-contain flex-shrink-0" />
        ) : (
          <Monitor className="h-5 w-5 text-[#1e64c8] flex-shrink-0" strokeWidth={2} />
        )}
        <span className="font-bold text-[16px] text-foreground tracking-tight">{appTitle}</span>
      </div>

      {/* Single scrollable area for both sections */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Locations section ── */}
        <div className="py-2">
          {/* Section header — click to expand, collapses stock */}
          <div className="px-3 mb-1 flex items-center justify-between">
            <button
              type="button"
              onClick={openLocations}
              className="flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e64c8] rounded-sm"
              aria-expanded={locationOpen}
            >
              {locationOpen
                ? <ChevronDown className="h-2.5 w-2.5 text-[#94a3b8]" />
                : <ChevronRight className="h-2.5 w-2.5 text-[#94a3b8]" />}
              <span className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-[0.08em] ml-0.5">
                {t("locations")}
              </span>
            </button>
            {canEdit && locationOpen && (
              <LocationFormDialog mode="create" parentId={null}>
                <Button variant="ghost" size="icon" aria-label={t("addTopLocation")} className="h-6 w-6">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </LocationFormDialog>
            )}
          </div>

          {locationOpen && (
            <>
              <div className="px-3 mb-2 relative">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-3 w-3 text-[#94a3b8] pointer-events-none" aria-hidden="true" />
                <label htmlFor="sidebar-location-filter" className="sr-only">Filter locations</label>
                <input
                  id="sidebar-location-filter"
                  type="search"
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  placeholder={t("filterLocations")}
                  className="w-full h-[28px] pl-7 pr-6 text-[12px] bg-background border border-border rounded-[6px] text-foreground placeholder:text-[#94a3b8] outline-none focus:border-[#1e64c8] focus:shadow-[0_0_0_2px_#e8f0fc] transition-shadow"
                />
                {filterQuery && (
                  <button
                    type="button"
                    aria-label="Clear location filter"
                    onClick={() => setFilterQuery("")}
                    className="absolute right-5 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#334155]"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              <AllLocationsEntry totalAssets={totalAssets} />

              {filterQuery && locationTree.every((l) => !nodeMatchesFilter(l, filterQuery.toLowerCase().trim())) && (
                <p className="px-3 py-3 text-[12px] text-[#94a3b8] text-center">{t("noLocationsMatch")}</p>
              )}

              {locationTree.length === 0 ? (
                <div className="px-3 py-4 text-center">
                  <Building2 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">{t("noLocationsYet")}</p>
                  {canEdit && (
                    <LocationFormDialog mode="create" parentId={null}>
                      <Button variant="outline" size="sm" className="mt-2 text-xs">
                        {t("addLocation")}
                      </Button>
                    </LocationFormDialog>
                  )}
                </div>
              ) : (
                <div>
                  {locationTree.map((location) => (
                    <LocationTreeItem
                      key={location.id}
                      location={location}
                      userRole={userRole}
                      assetCountMap={assetCountMap}
                      filterQuery={filterQuery.toLowerCase().trim()}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Stock section ── */}
        <div className="border-t border-border py-2">
          {/* Stock header row */}
          <div
            className={cn(
              "flex items-center gap-1 py-[5px] pl-[12px] pr-[10px] text-[12.5px] select-none",
              isStockPath ? "text-[#1e64c8] font-semibold" : "text-[#334155]"
            )}
          >
            {/* Chevron: toggle stock, collapse locations */}
            <button
              type="button"
              className="flex-shrink-0 h-4 w-4 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e64c8] rounded-sm"
              onClick={() => stockOpen ? setStockOpen(false) : openStock()}
              disabled={!hasStockTypes}
              aria-label={stockOpen ? t("collapseStock") : t("expandStock")}
              aria-expanded={stockOpen}
            >
              {hasStockTypes ? (
                stockOpen
                  ? <ChevronDown className={cn("h-3 w-3", isStockPath ? "stroke-[#1e64c8]" : "stroke-[#94a3b8]")} />
                  : <ChevronRight className={cn("h-3 w-3", isStockPath ? "stroke-[#1e64c8]" : "stroke-[#94a3b8]")} />
              ) : (
                <span className="h-3 w-3" />
              )}
            </button>

            {/* Stock link — navigating here also opens stock section */}
            <Link
              href="/stock"
              onClick={openStock}
              className="flex-1 flex items-center gap-1.5 min-w-0"
            >
              <Package className={cn("h-3 w-3 flex-shrink-0", isStockPath ? "text-[#1e64c8]" : "text-[#94a3b8]")} />
              <span className="truncate">{t("stock")}</span>
              {stockItemCount > 0 && (
                <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0 rounded flex-shrink-0 leading-5 ml-auto">
                  {stockItemCount}
                </span>
              )}
            </Link>
          </div>

          {/* Stock sub-items */}
          {stockOpen && hasStockTypes && (
            <Suspense fallback={null}>
              <StockNavItems
                stockTypes={stockTypes}
                stockItemCount={stockItemCount}
                decommissionedCount={decommissionedCount}
                inRepairCount={inRepairCount}
              />
            </Suspense>
          )}
        </div>

      </div>
    </aside>
  );
}
