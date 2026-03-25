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
  ShieldCheck,
  Factory,
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

type AdminNavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** If true, only ADMIN role can see it */
  adminOnly?: boolean;
};

const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin/users", label: "Users", icon: <Users className="h-4 w-4" />, adminOnly: true },
  { href: "/admin/asset-types", label: "Asset Types", icon: <Tag className="h-4 w-4" />, adminOnly: true },
  { href: "/admin/manufacturers", label: "Manufacturers", icon: <Factory className="h-4 w-4" />, adminOnly: true },
  { href: "/admin/import", label: "Import CSV", icon: <Upload className="h-4 w-4" />, adminOnly: false },
];

export function Sidebar({ locationTree, userRole }: SidebarProps) {
  const pathname = usePathname();
  const canEdit = userRole === "ADMIN" || userRole === "EDITOR";
  const isAdminOrEditor = canEdit;
  const isInAdmin = pathname.startsWith("/admin");
  const [adminOpen, setAdminOpen] = useState(isInAdmin);

  const visibleAdminItems = ADMIN_NAV.filter(
    (item) => !item.adminOnly || userRole === "ADMIN"
  );

  return (
    <aside className="w-[280px] flex-shrink-0 border-r bg-background flex flex-col h-full overflow-hidden">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 h-14 border-b flex-shrink-0">
        <Monitor className="h-5 w-5 text-primary" />
        <span className="font-semibold text-lg">SAM</span>
        <span className="text-xs text-muted-foreground ml-auto">Asset Management</span>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        {/* Location tree */}
        <div className="py-3 flex-1">
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

        {/* Admin section — visible to ADMIN and EDITOR */}
        {isAdminOrEditor && (
          <div className="border-t flex-shrink-0">
            {/* Collapsible header */}
            <button
              onClick={() => setAdminOpen((v) => !v)}
              className={cn(
                "w-full flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors",
                isInAdmin
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="flex-1 text-left">Administration</span>
              {adminOpen ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>

            {adminOpen && (
              <div className="px-2 pb-2 space-y-0.5">
                {visibleAdminItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                      pathname.startsWith(item.href)
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
