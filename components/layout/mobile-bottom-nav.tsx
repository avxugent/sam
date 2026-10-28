"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { MapPin, Search, ShieldCheck, Package } from "lucide-react";
import { cn } from "@/lib/utils";

type LabelKey = "locations" | "search" | "stock" | "administration";

type NavTab = {
  href: string;
  labelKey: LabelKey;
  icon: React.ReactNode;
  match: (pathname: string) => boolean;
};

const tabs: NavTab[] = [
  {
    href: "/locations",
    labelKey: "locations",
    icon: <MapPin className="h-5 w-5" />,
    match: (p) => p === "/" || p.startsWith("/locations"),
  },
  {
    href: "/search",
    labelKey: "search",
    icon: <Search className="h-5 w-5" />,
    match: (p) => p.startsWith("/search"),
  },
  {
    href: "/stock",
    labelKey: "stock",
    icon: <Package className="h-5 w-5" />,
    match: (p) => p.startsWith("/stock"),
  },
];

const adminTab: NavTab = {
  href: "/admin",
  labelKey: "administration",
  icon: <ShieldCheck className="h-5 w-5" />,
  match: (p) => p.startsWith("/admin"),
};

export function MobileBottomNav({ showAdminTab }: { showAdminTab: boolean }) {
  const pathname = usePathname();
  const tNav = useTranslations("nav");
  const tCommon = useTranslations("common");
  const navTabs = showAdminTab ? [...tabs, adminTab] : tabs;

  function labelOf(key: LabelKey): string {
    return key === "search" ? tCommon("search") : tNav(key);
  }

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-[58px] bg-card border-t border-border flex items-center z-40">
      {navTabs.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 h-full",
              active ? "text-[#1e64c8]" : "text-muted-foreground"
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
            <span className={cn("text-[10px]", active ? "font-semibold text-[#1e64c8]" : "font-normal text-muted-foreground")}>
              {labelOf(tab.labelKey)}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
