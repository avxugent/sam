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
import { cn } from "@/lib/utils";
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
  Merge,
  Truck,
} from "lucide-react";

type HeaderUser = {
  name?: string | null;
  email?: string | null;
  role?: string;
  provider?: string;
  totpEnabled?: boolean;
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
  labelKey: "users" | "assetTypes" | "manufacturers" | "suppliers" | "modelCleanup" | "importCsv" | "exportCsv" | "auditLog" | "compliance" | "settings";
  icon: React.ReactNode;
  adminOnly: boolean;
};

const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin/users", labelKey: "users", icon: <Users className="h-4 w-4" />, adminOnly: true },
  { href: "/admin/asset-types", labelKey: "assetTypes", icon: <Tag className="h-4 w-4" />, adminOnly: true },
  { href: "/admin/manufacturers", labelKey: "manufacturers", icon: <Factory className="h-4 w-4" />, adminOnly: true },
  { href: "/admin/suppliers", labelKey: "suppliers", icon: <Truck className="h-4 w-4" />, adminOnly: true },
  { href: "/admin/models", labelKey: "modelCleanup", icon: <Merge className="h-4 w-4" />, adminOnly: true },
  { href: "/admin/import", labelKey: "importCsv", icon: <Upload className="h-4 w-4" />, adminOnly: false },
  { href: "/admin/export", labelKey: "exportCsv", icon: <Download className="h-4 w-4" />, adminOnly: true },
  { href: "/admin/audit", labelKey: "auditLog", icon: <ClipboardList className="h-4 w-4" />, adminOnly: true },
  { href: "/admin/compliance", labelKey: "compliance", icon: <ShieldCheck className="h-4 w-4" />, adminOnly: true },
  { href: "/admin/settings", labelKey: "settings", icon: <Settings className="h-4 w-4" />, adminOnly: true },
];

function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (email?.[0] ?? "U").toUpperCase();
}

function SearchBar() {
  const t = useTranslations("nav");
  const tc = useTranslations("common");
  const tAsset = useTranslations("asset");
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [quickResults, setQuickResults] = useState<QuickResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pathname.startsWith("/search")) return;
  }, [pathname]);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  const fetchQuick = useCallback(async (q: string) => {
    if (q.length < 2) { setQuickResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) return;
      const data = await res.json();
      const results: QuickResult[] = [];

      for (const a of (data.assets ?? []).slice(0, 4)) {
        results.push({
          id: a.id,
          kind: "asset",
          title: a.model || a.hostname || a.serialNumber || tAsset("title"),
          subtitle: [a.type?.name, a.location?.name].filter(Boolean).join(" · "),
          href: `/locations/${a.location.id}/assets/${a.id}`,
        });
      }
      for (const l of (data.locations ?? []).slice(0, 3)) {
        results.push({
          id: l.id,
          kind: "location",
          title: l.name,
          subtitle: [l.fiNumber, l._count.assets + " assets"].filter(Boolean).join(" · "),
          href: `/locations/${l.id}`,
        });
      }

      setQuickResults(results);
      setOpen(results.length > 0);
    } finally {
      setLoading(false);
    }
  }, [tAsset]);

  useEffect(() => {
    const t = setTimeout(() => fetchQuick(query), 250);
    return () => clearTimeout(t);
  }, [query, fetchQuick]);

  // Reset highlight when results list changes
  useEffect(() => { setActiveIndex(-1); }, [quickResults]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" && quickResults.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (i + 1) % quickResults.length);
      return;
    }
    if (e.key === "ArrowUp" && quickResults.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (i <= 0 ? quickResults.length - 1 : i - 1));
      return;
    }
    if (e.key === "Enter") {
      if (open && activeIndex >= 0 && quickResults[activeIndex]) {
        e.preventDefault();
        const r = quickResults[activeIndex];
        handleSelect(r.href);
        return;
      }
      if (query.trim().length >= 2) {
        setOpen(false);
        router.push(`/search?q=${encodeURIComponent(query.trim())}`);
      }
    }
    if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      inputRef.current?.blur();
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
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748b] pointer-events-none" aria-hidden="true" />
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
          className="w-full h-[36px] pl-9 pr-8 text-[13px] bg-[#f8fafc] border border-[#e2e8f0] rounded-[8px] text-[#0f172a] placeholder:text-[#94a3b8] outline-none focus:border-[#1e64c8] focus:shadow-[0_0_0_3px_#e8f0fc] transition-shadow"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            aria-label={loading ? `${tc("search")}…` : tc("close")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#334155]"
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
          aria-label="Search results"
          className="absolute top-full mt-1.5 left-0 right-0 z-50 bg-white border border-[#e2e8f0] rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.08)] overflow-hidden list-none m-0 p-0"
        >
          {quickResults.map((r, idx) => (
            <li
              key={r.id + r.kind}
              id={`global-search-result-${idx}`}
              role="option"
              aria-selected={idx === activeIndex}
              className={cn(
                "flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors",
                idx === activeIndex ? "bg-[#e8f0fc]" : "hover:bg-[#f8fafc]"
              )}
              onMouseEnter={() => setActiveIndex(idx)}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(r.href); }}
            >
              <div
                aria-hidden="true"
                className={cn(
                  "w-[34px] h-[34px] rounded-[8px] flex items-center justify-center flex-shrink-0",
                  r.kind === "asset" ? "bg-[#e8f0fc]" : "bg-[#f1f5f9]"
                )}
              >
                {r.kind === "asset" ? (
                  <Package className="h-4 w-4 text-[#1e64c8]" />
                ) : (
                  <MapPin className="h-4 w-4 fill-[#1e64c8] stroke-[#1e64c8]" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-[#0f172a] truncate">{r.title}</p>
                {r.subtitle && (
                  <p className="text-[12px] text-[#64748b] truncate">{r.subtitle}</p>
                )}
              </div>
            </li>
          ))}
          <li role="presentation" className="border-t border-[#e2e8f0] px-3 py-2 bg-[#f8fafc]">
            <button
              type="button"
              className="text-xs text-[#1e64c8] hover:underline w-full text-left"
              onMouseDown={(e) => {
                e.preventDefault();
                setOpen(false);
                router.push(`/search?q=${encodeURIComponent(query.trim())}`);
              }}
            >
              See all results for &quot;{query}&quot; →
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

export function Header({ user, appTitle = "SAM", logoUrl = null }: { user: HeaderUser; appTitle?: string; logoUrl?: string | null }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const initials = getInitials(user.name, user.email);

  const visibleAdminItems = ADMIN_NAV.filter(
    (item) => !item.adminOnly || user.role === "ADMIN"
  );
  const isAdminOrEditor = user.role === "ADMIN" || user.role === "EDITOR";
  const isInAdmin = pathname.startsWith("/admin");

  return (
    <header className="h-[56px] border-b border-[#e2e8f0] flex items-center gap-3 px-4 bg-white flex-shrink-0 z-30">
      {/* Logo — mobile only (sidebar is hidden on mobile) */}
      <Link href="/" className="flex items-center gap-1.5 mr-1 lg:hidden flex-shrink-0">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-5 w-5 object-contain flex-shrink-0" />
        ) : (
          <Monitor className="h-5 w-5 text-[#1e64c8] flex-shrink-0" strokeWidth={2} />
        )}
        <span className="font-bold text-[16px] text-[#0f172a]">{appTitle}</span>
      </Link>

      {/* Search bar */}
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
            pathname.startsWith("/reports") && "bg-[#e8f0fc] text-[#1e64c8]"
          )}
          asChild
        >
          <Link href="/reports">
            <BarChart2 className="h-4 w-4" />
            {t("reports")}
          </Link>
        </Button>

        {isAdminOrEditor && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                aria-label={t("administration")}
                className={cn(
                  "text-[13px] h-[34px] px-[14px] rounded-[6px] border-[#e2e8f0] gap-1.5",
                  isInAdmin && "bg-[#e8f0fc] border-[#1e64c8] text-[#1e64c8]"
                )}
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:block">{t("administration")}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
              <DropdownMenuLabel className="text-[10px] font-semibold text-[#94a3b8] uppercase tracking-[0.08em]">
                {t("administration")}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {visibleAdminItems.map((item) => (
                <DropdownMenuItem key={item.href} asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 cursor-pointer text-[13px]",
                      pathname.startsWith(item.href) && "font-medium text-[#1e64c8]"
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

        {/* Language switcher */}
        <LanguageSwitcher />

        {/* Avatar + user menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Account menu for ${user.name ?? user.email ?? "user"}`}
              className="w-8 h-8 rounded-full bg-[#1e64c8] text-white text-[13px] font-semibold flex items-center justify-center flex-shrink-0 hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#1e64c8]"
            >
              <span aria-hidden="true">{initials}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
            <DropdownMenuLabel>
              <div className="text-[13px] font-medium">{user.name}</div>
              <div className="text-[12px] text-[#64748b] font-normal">{user.email}</div>
              <div className="text-[11px] text-[#64748b] font-normal mt-0.5">{user.role}</div>
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
                    <span className="ml-auto text-xs text-green-600">On</span>
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
