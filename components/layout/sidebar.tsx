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
  Settings,
  Users,
  Tag,
  Building2,
  Plus,
  Upload,
} from "lucide-react";
import { LocationFormDialog } from "@/components/locations/location-form-dialog";

type LocationNode = {
  id: string;
  name: string;
  children: LocationNode[];
  _count: { assets: number; children: number };
};

type SidebarProps = {
  locationTree: LocationNode[];
  userRole: string;
};

function LocationTreeItem({
  location,
  depth = 0,
  userRole,
}: {
  location: LocationNode;
  depth?: number;
  userRole: string;
}) {
  const pathname = usePathname();
  const isActive = pathname === `/locations/${location.id}`;
  const hasChildren = location.children.length > 0;
  const [open, setOpen] = useState(
    pathname.startsWith(`/locations/${location.id}`)
  );

  const totalAssets = countAssetsRecursive(location);

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
            />
          ))}
        </div>
      )}
    </div>
  );
}

function countAssetsRecursive(location: LocationNode): number {
  return (
    location._count.assets +
    location.children.reduce((sum, child) => sum + countAssetsRecursive(child), 0)
  );
}

export function Sidebar({ locationTree, userRole }: SidebarProps) {
  const pathname = usePathname();
  const canEdit = userRole === "ADMIN" || userRole === "EDITOR";

  return (
    <aside className="w-[280px] flex-shrink-0 border-r bg-background flex flex-col h-full overflow-hidden">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 h-14 border-b flex-shrink-0">
        <Monitor className="h-5 w-5 text-primary" />
        <span className="font-semibold text-lg">SAM</span>
        <span className="text-xs text-muted-foreground ml-auto">Asset Management</span>
      </div>

      {/* Location tree */}
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
              />
            ))}
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div className="border-t p-3 space-y-1 flex-shrink-0">
        {(userRole === "ADMIN" || userRole === "EDITOR") && (
          <Link
            href="/import"
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
              pathname.startsWith("/import")
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            <Upload className="h-4 w-4" />
            Import CSV
          </Link>
        )}
        {userRole === "ADMIN" && (
          <>
            <Link
              href="/settings/users"
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                pathname.startsWith("/settings/users")
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              <Users className="h-4 w-4" />
              Users
            </Link>
            <Link
              href="/settings/asset-types"
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                pathname.startsWith("/settings/asset-types")
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              <Tag className="h-4 w-4" />
              Asset Types
            </Link>
            <Link
              href="/settings/manufacturers"
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                pathname.startsWith("/settings/manufacturers")
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              <Settings className="h-4 w-4" />
              Manufacturers
            </Link>
          </>
        )}
      </div>
    </aside>
  );
}
