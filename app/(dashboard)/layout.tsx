import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { readSettings } from "@/lib/app-settings";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { ThemeSync } from "@/components/theme-sync";
import { AppFooter } from "@/components/layout/app-footer";
import { version } from "@/package.json";
import { canManageCatalog } from "@/lib/permissions";
import { getRecursiveAssetCounts } from "@/lib/location-path";
import { nestLocations } from "@/lib/location-tree";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const userCount = await prisma.user.count();
  if (userCount === 0) {
    redirect("/setup");
  }

  const locationTree = nestLocations(
    await prisma.location.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }] })
  );

  const assetCountMap = await getRecursiveAssetCounts();

  const [stockItemCount, decommissionedCount, inRepairCount, stockTypes, brandingMap] = await Promise.all([
    prisma.stockItem.count().catch(() => 0),
    prisma.asset.count({ where: { status: "DECOMMISSIONED" } }).catch(() => 0),
    prisma.asset.count({ where: { status: "IN_REPAIR" } }).catch(() => 0),
    prisma.assetType.findMany({
      where: { stockItems: { some: {} } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }).catch(() => [] as { id: string; name: string }[]),
    readSettings(["app.title", "branding.logoStorageKey"]).catch(() => ({} as Record<string, string>)),
  ]);

  const appTitle = brandingMap["app.title"] || "SAM";
  const logoUrl = brandingMap["branding.logoStorageKey"] ? "/api/branding/logo" : null;

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { provider: true, totpEnabled: true, theme: true },
  });

  const headerUser = {
    name: session.user.name,
    email: session.user.email,
    role: session.user.role,
    provider: dbUser?.provider ?? "credentials",
    totpEnabled: dbUser?.totpEnabled ?? false,
  };

  const showAdminNav = canManageCatalog(session.user.role);

  return (
    <>
    <ThemeSync serverTheme={dbUser?.theme ?? "light"} />
    <div className="flex flex-col h-screen bg-background">
      {/* Skip link — visible only on focus, jumps over the sidebar + header */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:bg-card focus:text-foreground focus:border focus:border-[#1e64c8] focus:rounded-md focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md"
      >
        Skip to main content
      </a>
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — hidden on mobile, visible on lg+ */}
        <Sidebar
          locationTree={locationTree}
          userRole={session.user.role}
          assetCountMap={assetCountMap}
          stockItemCount={stockItemCount}
          stockTypes={stockTypes}
          decommissionedCount={decommissionedCount}
          inRepairCount={inRepairCount}
          appTitle={appTitle}
          logoUrl={logoUrl}
        />
        <div className="flex flex-col flex-1 overflow-hidden">
          <Header user={headerUser} appTitle={appTitle} logoUrl={logoUrl} />
          {/* pb-[58px] on mobile to clear bottom nav; none on lg */}
          <main id="main-content" tabIndex={-1} className="flex-1 overflow-auto p-6 lg:p-7 pb-[74px] lg:pb-6 focus:outline-none">
            {children}
          </main>
        </div>
        {/* Mobile bottom tab bar */}
        <MobileBottomNav showAdminTab={showAdminNav} />
      </div>
      <AppFooter version={version} />
    </div>
    </>
  );
}
