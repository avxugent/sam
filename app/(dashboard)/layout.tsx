import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { ThemeSync } from "@/components/theme-sync";
import { AppFooter } from "@/components/layout/app-footer";
import { version } from "@/package.json";

type AssetCountRow = { id: string; totalAssets: bigint };

async function getRecursiveAssetCounts(): Promise<Record<string, number>> {
  const rows = await prisma.$queryRaw<AssetCountRow[]>`
    WITH RECURSIVE loc_tree AS (
      SELECT id AS root_id, id AS loc_id FROM locations
      UNION ALL
      SELECT lt.root_id, l.id AS loc_id
      FROM loc_tree lt
      INNER JOIN locations l ON l.parentId = lt.loc_id
    )
    SELECT lt.root_id AS id, COALESCE(SUM(a.quantity), 0) AS totalAssets
    FROM loc_tree lt
    LEFT JOIN assets a ON a.locationId = lt.loc_id
    GROUP BY lt.root_id
  `;

  const map: Record<string, number> = {};
  for (const row of rows) {
    map[row.id] = Number(row.totalAssets);
  }
  return map;
}

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

  const locationTree = await prisma.location.findMany({
    where: { parentId: null },
    include: {
      children: {
        include: {
          children: {
            include: {
              children: {
                include: {
                  children: {
                    include: {
                      children: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });

  const assetCountMap = await getRecursiveAssetCounts();

  const [stockItemCount, decommissionedCount, inRepairCount, stockTypes, brandingSettings] = await Promise.all([
    prisma.stockItem.count().catch(() => 0),
    prisma.asset.count({ where: { status: "DECOMMISSIONED" } }).catch(() => 0),
    prisma.asset.count({ where: { status: "IN_REPAIR" } }).catch(() => 0),
    prisma.assetType.findMany({
      where: { stockItems: { some: {} } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }).catch(() => [] as { id: string; name: string }[]),
    prisma.appSetting.findMany({
      where: { key: { in: ["app.title", "branding.logoStorageKey"] } },
    }).catch(() => []),
  ]);

  const brandingMap = Object.fromEntries(brandingSettings.map((s) => [s.key, s.value]));
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

  const isAdminOrEditor = session.user.role === "ADMIN" || session.user.role === "EDITOR";

  return (
    <>
    <ThemeSync serverTheme={dbUser?.theme ?? "light"} />
    <div className="flex flex-col h-screen bg-[#f8fafc]">
      {/* Skip link — visible only on focus, jumps over the sidebar + header */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:bg-white focus:text-[#0f172a] focus:border focus:border-[#1e64c8] focus:rounded-md focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md"
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
        <MobileBottomNav isAdminOrEditor={isAdminOrEditor} />
      </div>
      <AppFooter version={version} />
    </div>
    </>
  );
}
