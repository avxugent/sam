"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/layout/header-search";
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
  ShieldCheck,
  Users,
  Tag,
  Factory,
  Upload,
  Monitor,
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
import type { AuthProvider } from "@/lib/users/providers";

type HeaderUser = {
  name?: string | null;
  email?: string | null;
  role?: Role;
  provider?: AuthProvider;
  totpEnabled?: boolean;
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
