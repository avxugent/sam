import { prisma } from "@/lib/prisma";
import { getTranslations } from "next-intl/server";
import { MapPin } from "lucide-react";
import { LocationBrowserClient } from "@/components/locations/location-browser-client";
import type { LocationNode } from "@/components/locations/location-browser-client";
import type { Prisma } from "@/generated/prisma/client";
import { getRecursiveAssetCounts } from "@/lib/location-path";
import { PageHeader } from "@/components/layout/page-header";

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
      <PageHeader
        icon={MapPin}
        title={tNav("locations")}
        subtitle={`${totalAssets} asset${totalAssets !== 1 ? "s" : ""}`}
      />

      <LocationBrowserClient
        locationTree={locationTree}
        assetCountMap={assetCountMap}
      />
    </div>
  );
}

export const metadata = { title: "Locations – SAM" };
