import { prisma } from "@/lib/prisma";
import { getTranslations } from "next-intl/server";
import { MapPin } from "lucide-react";
import { LocationBrowserClient } from "@/components/locations/location-browser-client";
import type { LocationNode } from "@/components/locations/location-browser-client";
import type { Prisma } from "@/generated/prisma/client";
import { getRecursiveAssetCounts } from "@/lib/location-path";

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
  const [tNav, assetCountMap, rawTree, totalAssetQuantity] = await Promise.all([
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
    prisma.asset.aggregate({ where: { status: "INSTALLED" }, _sum: { quantity: true } }),
  ]);

  const locationTree = rawTree.map(toNode);
  const totalAssets = totalAssetQuantity._sum.quantity ?? 0;

  return (
    <div className="space-y-4">
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
