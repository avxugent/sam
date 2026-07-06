import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AssetTypesClient } from "@/components/settings/asset-types-client";

export default async function AssetTypesPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/");

  const types = await prisma.assetType.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      scrapeTargetTemplate: true,
      prometheusExposed: true,
      hostnamePattern: true,
      // Count active assets only — decommissioned ones are excluded from the
      // badge and drilldown (the drilldown API defaults to INSTALLED too).
      _count: { select: { assets: { where: { status: "INSTALLED" } } } },
    },
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Asset Types</h1>
        <p className="text-muted-foreground mt-1">
          Manage asset types and configure Prometheus scrape templates for
          exporter-based monitoring.
        </p>
      </div>
      <AssetTypesClient initialTypes={types} />
    </div>
  );
}

export const metadata = { title: "Asset Types – SAM Admin" };
