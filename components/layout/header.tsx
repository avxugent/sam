"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  User,
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
  label: string;
  icon: React.ReactNode;
  adminOnly: boolean;
};

const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin/users", label: "Users", icon: <Users className="h-4 w-4" />, adminOnly: true },
  { href: "/admin/asset-types", label: "Asset Types", icon: <Tag className="h-4 w-4" />, adminOnly: true },
  { href: "/admin/manufacturers", label: "Manufacturers", icon: <Factory className="h-4 w-4" />, adminOnly: true },
  { href: "/admin/import", label: "Import CSV", icon: <Upload className="h-4 w-4" />, adminOnly: false },
];

// ── Search bar with instant dropdown + full-page on Enter ──────────────────

function SearchBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [quickResults, setQuickResults] = useState<QuickResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync query input from URL when on /search page
  useEffect(() => {
    if (!pathname.startsWith("/search")) return;
  }, [pathname]);

  // Close dropdown on outside click
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

      // Top 4 assets
      for (const a of (data.assets ?? []).slice(0, 4)) {
        results.push({
          id: a.id,
          kind: "asset",
          title: a.model || a.hostname || a.serialNumber || "Asset",
          subtitle: [a.type?.name, a.location?.name].filter(Boolean).join(" · "),
          href: `/locations/${a.location.id}/assets/${a.id}`,
        });
      }
      // Top 3 locations
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
  }, []);

  // Debounce quick search
  useEffect(() => {
    const t = setTimeout(() => fetchQuick(query), 250);
    return () => clearTimeout(t);
  }, [query, fetchQuick]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && query.trim().length >= 2) {
      setOpen(false);
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    }
    if (e.key === "Escape") {
      setOpen(false);
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

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (quickResults.length > 0) setOpen(true); }}
          placeholder="Search assets, locations, serial numbers…"
          className="pl-9 pr-8 h-9 bg-muted/50 border-muted focus:bg-background"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <X className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>

      {/* Quick-results dropdown */}
      {open && quickResults.length > 0 && (
        <div className="absolute top-full mt-1.5 left-0 right-0 z-50 bg-popover border rounded-lg shadow-lg overflow-hidden">
          {quickResults.map((r) => (
            <button
              key={r.id + r.kind}
              className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-muted/60 text-left transition-colors"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(r.href); }}
            >
              {r.kind === "asset" ? (
                <Package className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              ) : (
                <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{r.title}</p>
                {r.subtitle && (
                  <p className="text-xs text-muted-foreground truncate">{r.subtitle}</p>
                )}
              </div>
              <span className="ml-auto text-xs text-muted-foreground flex-shrink-0 self-center capitalize">
                {r.kind}
              </span>
            </button>
          ))}
          <div className="border-t px-3 py-2 bg-muted/30">
            <button
              className="text-xs text-primary hover:underline w-full text-left"
              onMouseDown={(e) => {
                e.preventDefault();
                setOpen(false);
                router.push(`/search?q=${encodeURIComponent(query.trim())}`);
              }}
            >
              See all results for &quot;{query}&quot; →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Full top nav bar ────────────────────────────────────────────────────────

export function Header({ user }: { user: HeaderUser }) {
  const pathname = usePathname();
  const roleBadgeVariant =
    user.role === "ADMIN" ? "default" : user.role === "EDITOR" ? "secondary" : "outline";

  const visibleAdminItems = ADMIN_NAV.filter(
    (item) => !item.adminOnly || user.role === "ADMIN"
  );
  const isAdminOrEditor = user.role === "ADMIN" || user.role === "EDITOR";
  const isInAdmin = pathname.startsWith("/admin");

  return (
    <header className="h-14 border-b flex items-center gap-3 px-4 bg-background flex-shrink-0 z-30">
      {/* Logo / brand — visible only on mobile (sidebar hidden) */}
      <Link href="/" className="flex items-center gap-1.5 mr-1 lg:hidden flex-shrink-0">
        <Monitor className="h-5 w-5 text-primary" />
        <span className="font-semibold">SAM</span>
      </Link>

      {/* Search bar — takes available space */}
      <div className="flex-1">
        <SearchBar />
      </div>

      {/* Right-side nav items */}
      <nav className="flex items-center gap-1 flex-shrink-0">

        {/* Admin dropdown — visible to Admin and Editor */}
        {isAdminOrEditor && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "gap-1.5",
                  isInAdmin && "bg-muted text-foreground"
                )}
              >
                <ShieldCheck className="h-4 w-4" />
                <span className="hidden sm:block">Administration</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Administration
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {visibleAdminItems.map((item) => (
                <DropdownMenuItem key={item.href} asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 cursor-pointer",
                      pathname.startsWith(item.href) && "font-medium text-primary"
                    )}
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              <User className="h-4 w-4" />
              <span className="hidden sm:block">{user.name || user.email}</span>
              <Badge variant={roleBadgeVariant} className="text-xs hidden sm:inline-flex">
                {user.role}
              </Badge>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>
              <div className="text-sm font-medium">{user.name}</div>
              <div className="text-xs text-muted-foreground font-normal">{user.email}</div>
              <Badge variant={roleBadgeVariant} className="text-xs mt-1">
                {user.role}
              </Badge>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {/* 2FA settings — only for local accounts (SSO manages their own 2FA) */}
            {user.provider === "credentials" && (
              <DropdownMenuItem asChild>
                <Link href="/settings/2fa" className="flex items-center gap-2 cursor-pointer">
                  <KeyRound className="h-4 w-4" />
                  Two-Factor Auth
                  {user.totpEnabled && (
                    <span className="ml-auto text-xs text-green-600">On</span>
                  )}
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-destructive focus:text-destructive cursor-pointer"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
    </header>
  );
}
