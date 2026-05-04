"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MapPin, Search, ShieldCheck, Package } from "lucide-react";
import { cn } from "@/lib/utils";

type NavTab = {
  href: string;
  label: string;
  icon: React.ReactNode;
  match: (pathname: string) => boolean;
};

const tabs: NavTab[] = [
  {
    href: "/",
    label: "Locations",
    icon: <MapPin className="h-5 w-5" />,
    match: (p) => p === "/" || p.startsWith("/locations"),
  },
  {
    href: "/search",
    label: "Search",
    icon: <Search className="h-5 w-5" />,
    match: (p) => p.startsWith("/search"),
  },
  {
    href: "/stock",
    label: "Stock",
    icon: <Package className="h-5 w-5" />,
    match: (p) => p.startsWith("/stock"),
  },
];

const adminTab: NavTab = {
  href: "/admin/users",
  label: "Admin",
  icon: <ShieldCheck className="h-5 w-5" />,
  match: (p) => p.startsWith("/admin"),
};

export function MobileBottomNav({ isAdminOrEditor }: { isAdminOrEditor: boolean }) {
  const pathname = usePathname();
  const navTabs = isAdminOrEditor ? [...tabs, adminTab] : tabs;

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-[58px] bg-white border-t border-[#e2e8f0] flex items-center z-40">
      {navTabs.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 h-full",
              active ? "text-[#1e64c8]" : "text-[#64748b]"
            )}
          >
            <div
              className={cn(
                "w-8 h-8 rounded-[8px] flex items-center justify-center",
                active ? "bg-[#fffbe6]" : ""
              )}
            >
              {tab.icon}
            </div>
            <span className={cn("text-[10px]", active ? "font-semibold text-[#1e64c8]" : "font-normal text-[#64748b]")}>
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
