import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

type AssetCountRow = { id: string; totalAssets: bigint };

/**
 * Returns a map of locationId -> total recursive asset count using a
 * MySQL recursive CTE. Accurate at any depth, one query.
 *
 * The CTE builds a (root_id, loc_id) table where loc_id is the location
 * itself or any of its descendants. Grouping by root_id then sums assets
 * across the entire subtree of each location.
 */
async function getRecursiveAssetCounts(): Promise<Record<string, number>> {
  const rows = await prisma.$queryRaw<AssetCountRow[]>`
    WITH RECURSIVE loc_tree AS (
      SELECT id AS root_id, id AS loc_id FROM locations
      UNION ALL
      SELECT lt.root_id, l.id AS loc_id
      FROM loc_tree lt
      INNER JOIN locations l ON l.parentId = lt.loc_id
    )
    SELECT lt.root_id AS id, COUNT(a.id) AS totalAssets
    FROM loc_tree lt
    LEFT JOIN assets a ON a.locationId = lt.loc_id
    GROUP BY lt.root_id
  `;

  const map: Record<string, number> = {};
  for (const row of rows) {
    // MySQL returns COUNT as BigInt
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

  // Check if setup is required
  const userCount = await prisma.user.count();
  if (userCount === 0) {
    redirect("/setup");
  }

  // Fetch the location tree (structure only, no counts — counts come from CTE)
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

  // Get accurate recursive asset counts via SQL CTE
  const assetCountMap = await getRecursiveAssetCounts();

  // Fetch extra user fields needed by the header (provider, totpEnabled)
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { provider: true, totpEnabled: true },
  });

  const headerUser = {
    name: session.user.name,
    email: session.user.email,
    role: session.user.role,
    provider: dbUser?.provider ?? "credentials",
    totpEnabled: dbUser?.totpEnabled ?? false,
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        locationTree={locationTree}
        userRole={session.user.role}
        assetCountMap={assetCountMap}
      />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header user={headerUser} />
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
