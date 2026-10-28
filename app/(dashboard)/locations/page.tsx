import { prisma } from "@/lib/prisma";
import { getTranslations } from "next-intl/server";
import { MapPin } from "lucide-react";
import { LocationBrowserClient } from "@/components/locations/location-browser-client";
import type { LocationNode } from "@/components/locations/location-browser-client";
import { nestLocations, type Nested } from "@/lib/location-tree";
import { getRecursiveAssetCounts } from "@/lib/location-path";
import { PageHeader } from "@/components/layout/page-header";

function toNode(loc: Nested<{ id: string; name: string; fiNumber: string | null; parentId: string | null }>): LocationNode {
  return {
    id: loc.id,
    name: loc.name,
    fiNumber: loc.fiNumber,
    children: loc.children.map(toNode),
  };
}

export default async function AllLocationsPage() {
  const [tNav, tLocation, assetCountMap, locations, totalAssetQuantity] = await Promise.all([
    getTranslations("nav"),
    getTranslations("location"),
    getRecursiveAssetCounts(),
    prisma.location.findMany({
      select: { id: true, name: true, fiNumber: true, parentId: true },
      orderBy: [{ order: "asc" }, { name: "asc" }],
    }),
    prisma.asset.aggregate({ where: { status: "INSTALLED" }, _sum: { quantity: true } }),
  ]);

  const locationTree = nestLocations(locations).map(toNode);
  const totalAssets = totalAssetQuantity._sum.quantity ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader
        icon={MapPin}
        title={tNav("locations")}
        subtitle={tLocation("assetCount", { count: totalAssets })}
      />

      <LocationBrowserClient
        locationTree={locationTree}
        assetCountMap={assetCountMap}
      />
    </div>
  );
}

export const metadata = { title: "Locations – SAM" };
