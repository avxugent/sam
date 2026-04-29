"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
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
} from "lucide-react";
import { LocationFormDialog } from "@/components/locations/location-form-dialog";

type LocationNode = {
  id: string;
  name: string;
  children: LocationNode[];
};

type SidebarProps = {
  locationTree: LocationNode[];
  userRole: string;
  assetCountMap: Record<string, number>;
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
  userRole: string;
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

  // Depth 2+ uses a dot indicator instead of a chevron
  const useDot = depth >= 2;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 py-[5px] text-[12.5px] group relative cursor-pointer select-none",
          isActive
            ? "bg-[#e8f0fc] text-[#1e64c8] font-semibold border-r-[3px] border-[#1e64c8]"
            : "text-[#334155] hover:bg-[#f8fafc]"
        )}
        style={{ paddingLeft: `${12 + depth * 14}px`, paddingRight: "10px" }}
      >
        {/* Expand/collapse button or dot */}
        <button
          type="button"
          className="flex-shrink-0 h-4 w-4 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e64c8] rounded-sm"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? `Collapse ${location.name}` : `Expand ${location.name}`}
          aria-expanded={hasChildren ? open : undefined}
          disabled={!hasChildren}
        >
          {useDot ? (
            <span
              className={cn(
                "block w-[5px] h-[5px] rounded-full",
                isActive ? "bg-[#1e64c8]" : "bg-[#cbd5e1]"
              )}
            />
          ) : hasChildren ? (
            open ? (
              <ChevronDown className={cn("h-3 w-3", isActive ? "stroke-[#1e64c8]" : "stroke-[#94a3b8]")} />
            ) : (
              <ChevronRight className={cn("h-3 w-3", isActive ? "stroke-[#1e64c8]" : "stroke-[#94a3b8]")} />
            )
          ) : (
            <span className="h-3 w-3" />
          )}
        </button>

        <Link
          href={`/locations/${location.id}`}
          className="flex-1 flex items-center gap-1.5 min-w-0"
        >
          <MapPin className={cn("h-3 w-3 flex-shrink-0", isActive ? "fill-[#1e64c8] stroke-[#1e64c8]" : "stroke-[#94a3b8]")} />
          <span className="truncate">
            {selfMatches ? <mark className="bg-yellow-100 text-inherit rounded-[2px]">{location.name}</mark> : location.name}
          </span>
        </Link>

        {totalAssets > 0 && (
          <span className="text-[11px] text-[#64748b] bg-[#f1f5f9] px-1.5 py-0 rounded flex-shrink-0 leading-5">
            {totalAssets}
          </span>
        )}
      </div>

      {/* Children */}
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
  const isActive = pathname === "/locations";
  return (
    <Link
      href="/locations"
      className={cn(
        "flex items-center gap-1.5 px-3 py-[5px] text-[12.5px] select-none",
        isActive
          ? "bg-[#e8f0fc] text-[#1e64c8] font-semibold border-r-[3px] border-[#1e64c8]"
          : "text-[#334155] hover:bg-[#f8fafc]"
      )}
    >
      <Layers className={cn("h-3 w-3 flex-shrink-0", isActive ? "text-[#1e64c8]" : "text-[#94a3b8]")} />
      <span className="flex-1 truncate">All locations</span>
      {totalAssets > 0 && (
        <span className="text-[11px] text-[#64748b] bg-[#f1f5f9] px-1.5 py-0 rounded flex-shrink-0 leading-5">
          {totalAssets}
        </span>
      )}
    </Link>
  );
}

export function Sidebar({ locationTree, userRole, assetCountMap }: SidebarProps) {
  const canEdit = userRole === "ADMIN" || userRole === "EDITOR";
  const totalAssets = locationTree.reduce((sum, loc) => sum + (assetCountMap[loc.id] ?? 0), 0);
  const [filterQuery, setFilterQuery] = useState("");

  return (
    <aside className="w-[248px] flex-shrink-0 border-r bg-white flex flex-col h-full overflow-hidden hidden lg:flex">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 h-[56px] border-b flex-shrink-0">
        <Monitor className="h-5 w-5 text-[#1e64c8]" strokeWidth={2} />
        <span className="font-bold text-[16px] text-[#0f172a] tracking-tight">SAM</span>
      </div>

      {/* Location tree */}
      <div className="flex-1 overflow-y-auto py-3">
        <div className="px-3 mb-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-[0.08em]">
            Locations
          </span>
          {canEdit && (
            <LocationFormDialog mode="create" parentId={null}>
              <Button variant="ghost" size="icon" aria-label="Add top-level location" className="h-6 w-6">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </LocationFormDialog>
          )}
        </div>

        <div className="px-3 mb-2 relative">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-3 w-3 text-[#94a3b8] pointer-events-none" aria-hidden="true" />
          <label htmlFor="sidebar-location-filter" className="sr-only">Filter locations</label>
          <input
            id="sidebar-location-filter"
            type="search"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filter locations…"
            className="w-full h-[28px] pl-7 pr-6 text-[12px] bg-[#f8fafc] border border-[#e2e8f0] rounded-[6px] text-[#0f172a] placeholder:text-[#94a3b8] outline-none focus:border-[#1e64c8] focus:shadow-[0_0_0_2px_#e8f0fc] transition-shadow"
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
          <p className="px-3 py-3 text-[12px] text-[#94a3b8] text-center">No locations match</p>
        )}

        {locationTree.length === 0 ? (
          <div className="px-3 py-4 text-center">
            <Building2 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No locations yet</p>
            {canEdit && (
              <LocationFormDialog mode="create" parentId={null}>
                <Button variant="outline" size="sm" className="mt-2 text-xs">
                  Add location
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
      </div>
    </aside>
  );
}
