import { prisma } from "@/lib/prisma";
import { getTranslations } from "next-intl/server";
import { MapPin } from "lucide-react";
import { LocationBrowserClient } from "@/components/locations/location-browser-client";
import type { LocationNode } from "@/components/locations/location-browser-client";
import type { Prisma } from "@/generated/prisma/client";

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
    SELECT lt.root_id AS id, COUNT(a.id) AS totalAssets
    FROM loc_tree lt
    LEFT JOIN assets a ON a.locationId = lt.loc_id
    GROUP BY lt.root_id
  `;
  const map: Record<string, number> = {};
  for (const row of rows) map[row.id] = Number(row.totalAssets);
  return map;
}

type DbLocation = Prisma.LocationGetPayload<{
  include: {
    children: {
      include: {
        children: {
          include: {
            children: {
              include: { children: { include: { children: true } } };
            };
          };
        };
      };
    };
  };
}>;

function toNode(loc: DbLocation): LocationNode {
  return {
    id: loc.id,
    name: loc.name,
    fiNumber: loc.fiNumber,
    children: (loc.children as DbLocation[]).map(toNode),
  };
}

export default async function AllLocationsPage() {
  const [tNav, assetCountMap, rawTree, totalAssets] = await Promise.all([
    getTranslations("nav"),
    getRecursiveAssetCounts(),
    prisma.location.findMany({
      where: { parentId: null },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      include: {
        children: {
          orderBy: [{ order: "asc" }, { name: "asc" }],
          include: {
            children: {
              orderBy: [{ order: "asc" }, { name: "asc" }],
              include: {
                children: {
                  orderBy: [{ order: "asc" }, { name: "asc" }],
                  include: {
                    children: {
                      orderBy: [{ order: "asc" }, { name: "asc" }],
                      include: { children: { orderBy: [{ order: "asc" }, { name: "asc" }] } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.asset.count(),
  ]);

  const locationTree = rawTree.map(toNode);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-[9px] bg-[#e8f0fc] flex items-center justify-center flex-shrink-0">
          <MapPin className="h-4 w-4 text-[#1e64c8]" />
        </div>
        <div>
          <h1 className="text-[22px] font-bold text-[#0f172a] tracking-[-0.01em]">
            {tNav("locations")}
          </h1>
          <p className="text-[13px] text-[#64748b] mt-0.5">
            {totalAssets} asset{totalAssets !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <LocationBrowserClient
        locationTree={locationTree}
        assetCountMap={assetCountMap}
      />
    </div>
  );
}

export const metadata = { title: "Locations – SAM" };
