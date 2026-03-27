import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

type AssetCountRow = { id: string; totalAssets: bigint };

/**
 * Returns a map of locationId -> total recursive asset count using a
 * MySQL recursive CTE. Accurate at any depth, one query.
 */
async function getRecursiveAssetCounts(): Promise<Record<string, number>> {
  const rows = await prisma.$queryRaw<AssetCountRow[]>`
    WITH RECURSIVE loc_tree AS (
      SELECT id, parentId FROM locations
      UNION ALL
      SELECT l.id, l.parentId
      FROM locations l
      INNER JOIN loc_tree lt ON l.parentId = lt.id
    )
    SELECT lt.id, COUNT(a.id) AS totalAssets
    FROM loc_tree lt
    LEFT JOIN assets a ON a.locationId = lt.id
    GROUP BY lt.id
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

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        locationTree={locationTree}
        userRole={session.user.role}
        assetCountMap={assetCountMap}
      />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header user={{ name: session.user.name, email: session.user.email, role: session.user.role }} />
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
