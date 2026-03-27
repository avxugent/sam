"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Monitor,
  ChevronRight,
  ChevronDown,
  MapPin,
  Building2,
  Plus,
} from "lucide-react";
import { LocationFormDialog } from "@/components/locations/location-form-dialog";

// LocationNode — counts supplied externally via assetCountMap
type LocationNode = {
  id: string;
  name: string;
  children: LocationNode[];
};

type SidebarProps = {
  locationTree: LocationNode[];
  userRole: string;
  /** Map of locationId → recursive total asset count (from server CTE) */
  assetCountMap: Record<string, number>;
};

function LocationTreeItem({
  location,
  depth = 0,
  userRole,
  assetCountMap,
}: {
  location: LocationNode;
  depth?: number;
  userRole: string;
  assetCountMap: Record<string, number>;
}) {
  const pathname = usePathname();
  const isActive = pathname === `/locations/${location.id}`;
  const hasChildren = location.children.length > 0;
  const [open, setOpen] = useState(
    pathname.startsWith(`/locations/${location.id}`)
  );

  const totalAssets = assetCountMap[location.id] ?? 0;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 rounded-md px-2 py-1 text-sm group",
          isActive
            ? "bg-primary text-primary-foreground"
            : "hover:bg-muted text-foreground"
        )}
        style={{ paddingLeft: `${(depth + 1) * 12}px` }}
      >
        <button
          className="flex-shrink-0 h-4 w-4 flex items-center justify-center"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Collapse" : "Expand"}
        >
          {hasChildren ? (
            open ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )
          ) : (
            <span className="h-3 w-3" />
          )}
        </button>
        <Link
          href={`/locations/${location.id}`}
          className="flex-1 flex items-center gap-2 min-w-0"
        >
          <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="truncate">{location.name}</span>
        </Link>
        {totalAssets > 0 && (
          <Badge
            variant={isActive ? "outline" : "secondary"}
            className="text-xs px-1.5 py-0 h-5 flex-shrink-0"
          >
            {totalAssets}
          </Badge>
        )}
      </div>
      {open && hasChildren && (
        <div>
          {location.children.map((child) => (
            <LocationTreeItem
              key={child.id}
              location={child}
              depth={depth + 1}
              userRole={userRole}
              assetCountMap={assetCountMap}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ locationTree, userRole, assetCountMap }: SidebarProps) {
  const canEdit = userRole === "ADMIN" || userRole === "EDITOR";

  return (
    <aside className="w-[260px] flex-shrink-0 border-r bg-background flex flex-col h-full overflow-hidden">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 h-14 border-b flex-shrink-0">
        <Monitor className="h-5 w-5 text-primary" />
        <span className="font-semibold text-lg">SAM</span>
        <span className="text-xs text-muted-foreground ml-auto hidden lg:block">
          Asset Management
        </span>
      </div>

      {/* Location tree — takes all remaining height */}
      <div className="flex-1 overflow-y-auto py-3">
        <div className="px-3 mb-1 flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Locations
          </span>
          {canEdit && (
            <LocationFormDialog mode="create" parentId={null}>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </LocationFormDialog>
          )}
        </div>

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
          <div className="space-y-0.5 px-1">
            {locationTree.map((location) => (
              <LocationTreeItem
                key={location.id}
                location={location}
                userRole={userRole}
                assetCountMap={assetCountMap}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
