import { prisma } from "@/lib/prisma";
import { getTranslations } from "next-intl/server";
import { MapPin } from "lucide-react";
import { LocationBrowserClient } from "@/components/locations/location-browser-client";
import { nestLocations } from "@/lib/locations/tree";
import { getInstalledUnitTotals } from "@/lib/locations/path";
import { PageHeader } from "@/components/layout/page-header";

export default async function AllLocationsPage() {
  const [tNav, tLocation, assetCountMap, locations, totalAssetQuantity] = await Promise.all([
    getTranslations("nav"),
    getTranslations("location"),
    getInstalledUnitTotals(),
    prisma.location.findMany({
      select: { id: true, name: true, fiNumber: true, parentId: true },
      orderBy: [{ order: "asc" }, { name: "asc" }],
    }),
    prisma.asset.aggregate({ where: { status: "INSTALLED" }, _sum: { quantity: true } }),
  ]);

  const locationTree = nestLocations(locations);
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

export async function generateMetadata() {
  const t = await getTranslations("nav");
  return { title: t("locations") };
}
