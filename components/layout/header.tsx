"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, getInitials } from "@/lib/utils";
import {
  LogOut,
  Search,
  X,
  ShieldCheck,
  Users,
  Tag,
  Factory,
  Upload,
  Monitor,
  Loader2,
  MapPin,
  Package,
  KeyRound,
  Download,
  ClipboardList,
  Settings,
  UserCog,
  BarChart2,
  Boxes,
  Truck,
} from "lucide-react";
import { canManageCatalog, isAdmin, type Role } from "@/lib/permissions";
import { apiFetch } from "@/lib/api-client";
import { assetLabel } from "@/lib/assets/label";
import type { AuthProvider } from "@/lib/users/providers";

type HeaderUser = {
  name?: string | null;
  email?: string | null;
  role?: Role;
  provider?: AuthProvider;
  totpEnabled?: boolean;
};

/** The parts of GET /api/search the quick results use. */
type QuickSearchResponse = {
  assets: {
    id: string;
    hostname: string | null;
    serialNumber: string | null;
    model?: { name: string } | null;
    type?: { name: string } | null;
    location: { id: string; name: string };
  }[];
  locations: { id: string; name: string; fiNumber: string | null; _count: { assets: number } }[];
};

type QuickResult = {
  id: string;
  kind: "asset" | "location";
  title: string;
  subtitle: string;
  href: string;
};

type AdminNavItem = {
  href: string;
  labelKey: "users" | "assetTypes" | "manufacturers" | "suppliers" | "models" | "importCsv" | "exportCsv" | "auditLog" | "compliance" | "settings";
  icon: React.ReactNode;
  /** The predicate that guards the page itself. */
  allowed: (role: Role | undefined) => boolean;
};

const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin/users", labelKey: "users", icon: <Users className="h-4 w-4" />, allowed: isAdmin },
  { href: "/admin/asset-types", labelKey: "assetTypes", icon: <Tag className="h-4 w-4" />, allowed: isAdmin },
  { href: "/admin/manufacturers", labelKey: "manufacturers", icon: <Factory className="h-4 w-4" />, allowed: canManageCatalog },
  { href: "/admin/suppliers", labelKey: "suppliers", icon: <Truck className="h-4 w-4" />, allowed: canManageCatalog },
  { href: "/admin/models", labelKey: "models", icon: <Boxes className="h-4 w-4" />, allowed: canManageCatalog },
  { href: "/admin/import", labelKey: "importCsv", icon: <Upload className="h-4 w-4" />, allowed: isAdmin },
  { href: "/admin/export", labelKey: "exportCsv", icon: <Download className="h-4 w-4" />, allowed: isAdmin },
  { href: "/admin/audit", labelKey: "auditLog", icon: <ClipboardList className="h-4 w-4" />, allowed: isAdmin },
  { href: "/admin/compliance", labelKey: "compliance", icon: <ShieldCheck className="h-4 w-4" />, allowed: isAdmin },
  { href: "/admin/settings", labelKey: "settings", icon: <Settings className="h-4 w-4" />, allowed: isAdmin },
];

function SearchBar() {
  const t = useTranslations("nav");
  const tc = useTranslations("common");
  const tAsset = useTranslations("asset");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [quickResults, setQuickResults] = useState<QuickResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  const fetchQuick = useCallback(async (q: string, signal: AbortSignal) => {
    // Too short to search: also clears a spinner left by an aborted request.
    if (q.length < 2) { setQuickResults([]); setOpen(false); setLoading(false); return; }
    setLoading(true);
    try {
      const res = await apiFetch<QuickSearchResponse>(`/api/search?q=${encodeURIComponent(q)}`, { signal });
      // Aborted because a newer query superseded this one.
      if (signal.aborted) return;
      if (!res.ok) {
        setQuickResults([]);
        setOpen(false);
        return;
      }
      const data = res.data;
      const results: QuickResult[] = [];

      for (const a of data.assets.slice(0, 4)) {
        results.push({
          id: a.id,
          kind: "asset",
          title: assetLabel(a) ?? tAsset("title"),
          subtitle: [a.type?.name, a.location.name].filter(Boolean).join(" · "),
          href: `/locations/${a.location.id}/assets/${a.id}`,
        });
      }
      for (const l of data.locations.slice(0, 3)) {
        results.push({
          id: l.id,
          kind: "location",
          title: l.name,
          subtitle: [l.fiNumber, tAsset("assetCount", { count: l._count.assets })].filter(Boolean).join(" · "),
          href: `/locations/${l.id}`,
        });
      }

      setQuickResults(results);
      setOpen(results.length > 0);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [tAsset]);

  useEffect(() => {
    const controller = new AbortController();
    const t = setTimeout(() => fetchQuick(query, controller.signal), 250);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query, fetchQuick]);

  // Reset highlight when results list changes
  useEffect(() => { setActiveIndex(-1); }, [quickResults]);

  function openFullSearch() {
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        if (quickResults.length === 0) return;
        e.preventDefault();
        setOpen(true);
        setActiveIndex((i) => (i + 1) % quickResults.length);
        return;
      case "ArrowUp":
        if (quickResults.length === 0) return;
        e.preventDefault();
        setOpen(true);
        setActiveIndex((i) => (i <= 0 ? quickResults.length - 1 : i - 1));
        return;
      case "Enter":
        if (open && activeIndex >= 0 && quickResults[activeIndex]) {
          e.preventDefault();
          handleSelect(quickResults[activeIndex].href);
        } else if (query.trim().length >= 2) {
          openFullSearch();
        }
        return;
      case "Escape":
        setOpen(false);
        setActiveIndex(-1);
        inputRef.current?.blur();
        return;
    }
  }

  function handleSelect(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  function handleClear() {
    setQuery("");
    setQuickResults([]);
    setOpen(false);
    inputRef.current?.focus();
  }

  const isExpanded = open && quickResults.length > 0;
  const activeId = isExpanded && activeIndex >= 0 ? `global-search-result-${activeIndex}` : undefined;

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
        <label htmlFor="global-search" className="sr-only">{t("searchPlaceholder")}</label>
        <input
          ref={inputRef}
          id="global-search"
          type="search"
          role="combobox"
          aria-expanded={isExpanded}
          aria-controls="global-search-listbox"
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (quickResults.length > 0) setOpen(true); }}
          placeholder={t("searchPlaceholder")}
          className="w-full h-[36px] pl-9 pr-8 text-[13px] bg-background border border-border rounded-[8px] text-foreground placeholder:text-subtle outline-none focus:border-primary focus:shadow-[0_0_0_3px_var(--blue-tint)] transition-shadow"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            aria-label={loading ? `${tc("search")}…` : tc("close")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-subtle hover:text-secondary-foreground"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <X className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>

      {isExpanded && (
        <ul
          id="global-search-listbox"
          role="listbox"
          aria-label={t("searchResults")}
          className="absolute top-full mt-1.5 left-0 right-0 z-50 bg-card border border-border rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.08)] overflow-hidden list-none m-0 p-0"
        >
          {quickResults.map((r, idx) => (
            <li
              key={r.id + r.kind}
              id={`global-search-result-${idx}`}
              role="option"
              aria-selected={idx === activeIndex}
              className={cn(
                "flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors",
                idx === activeIndex ? "bg-primary-tint" : "hover:bg-background"
              )}
              onMouseEnter={() => setActiveIndex(idx)}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(r.href); }}
            >
              <div
                aria-hidden="true"
                className={cn(
                  "w-[34px] h-[34px] rounded-[8px] flex items-center justify-center flex-shrink-0",
                  r.kind === "asset" ? "bg-primary-tint" : "bg-muted"
                )}
              >
                {r.kind === "asset" ? (
                  <Package className="h-4 w-4 text-primary" />
                ) : (
                  <MapPin className="h-4 w-4 fill-primary stroke-primary" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-foreground truncate">{r.title}</p>
                {r.subtitle && (
                  <p className="text-[12px] text-muted-foreground truncate">{r.subtitle}</p>
                )}
              </div>
            </li>
          ))}
          <li role="presentation" className="border-t border-border px-3 py-2 bg-background">
            <button
              type="button"
              className="text-xs text-primary hover:underline w-full text-left"
              onMouseDown={(e) => {
                e.preventDefault();
                openFullSearch();
              }}
            >
              {t("seeAllResultsFor", { query })}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

export function Header({ user, appTitle, logoUrl }: { user: HeaderUser; appTitle: string; logoUrl: string | null }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const initials = getInitials(user.name, user.email);

  const visibleAdminItems = ADMIN_NAV.filter((item) => item.allowed(user.role));
  const isInAdmin = pathname.startsWith("/admin");

  return (
    <header className="h-[56px] border-b border-border flex items-center gap-3 px-4 bg-card flex-shrink-0 z-30">
      {/* Logo — mobile only (sidebar is hidden on mobile) */}
      <Link href="/" className="flex items-center gap-1.5 mr-1 lg:hidden flex-shrink-0">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-5 w-5 object-contain flex-shrink-0" />
        ) : (
          <Monitor className="h-5 w-5 text-primary flex-shrink-0" strokeWidth={2} />
        )}
        <span className="font-bold text-[16px] text-foreground">{appTitle}</span>
      </Link>

      <div className="flex-1">
        <SearchBar />
      </div>

      {/* Right-side items */}
      <nav className="flex items-center gap-2 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "text-[13px] h-[34px] px-[14px] rounded-[6px] gap-1.5 hidden sm:flex",
            pathname.startsWith("/reports") && "bg-primary-tint text-primary"
          )}
          asChild
        >
          <Link href="/reports">
            <BarChart2 className="h-4 w-4" />
            {t("reports")}
          </Link>
        </Button>

        {visibleAdminItems.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                aria-label={t("administration")}
                className={cn(
                  "text-[13px] h-[34px] px-[14px] rounded-[6px] border-border gap-1.5",
                  isInAdmin && "bg-primary-tint border-primary text-primary"
                )}
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:block">{t("administration")}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
              <DropdownMenuLabel className="text-[10px] font-semibold text-subtle uppercase tracking-[0.08em]">
                {t("administration")}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {visibleAdminItems.map((item) => (
                <DropdownMenuItem key={item.href} asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 cursor-pointer text-[13px]",
                      pathname.startsWith(item.href) && "font-medium text-primary"
                    )}
                  >
                    {item.icon}
                    {t(item.labelKey)}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <LanguageSwitcher />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t("accountMenu", { name: user.name ?? user.email ?? "" })}
              className="w-8 h-8 rounded-full bg-primary text-white text-[13px] font-semibold flex items-center justify-center flex-shrink-0 hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
            >
              <span aria-hidden="true">{initials}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
            <DropdownMenuLabel>
              <div className="text-[13px] font-medium">{user.name}</div>
              <div className="text-[12px] text-muted-foreground font-normal">{user.email}</div>
              <div className="text-[11px] text-muted-foreground font-normal mt-0.5">{user.role}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings/profile" className="flex items-center gap-2 cursor-pointer text-[13px]">
                <UserCog className="h-4 w-4" />
                {t("profile")}
              </Link>
            </DropdownMenuItem>
            {user.provider === "credentials" && (
              <DropdownMenuItem asChild>
                <Link href="/settings/2fa" className="flex items-center gap-2 cursor-pointer text-[13px]">
                  <KeyRound className="h-4 w-4" />
                  {t("twoFactorAuth")}
                  {user.totpEnabled && (
                    <span className="ml-auto text-xs text-green-600">{t("twoFactorOn")}</span>
                  )}
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-destructive focus:text-destructive cursor-pointer text-[13px]"
            >
              <LogOut className="mr-2 h-4 w-4" />
              {t("signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
    </header>
  );
}
