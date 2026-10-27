import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AssetTypesClient } from "@/components/settings/asset-types-client";
import { isAdmin } from "@/lib/permissions";

export default async function AssetTypesPage() {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) redirect("/");

  const [types, manufacturers] = await Promise.all([
    prisma.assetType.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        scrapeTargetTemplate: true,
        prometheusExposed: true,
        hostnamePattern: true,
        defaultCriticality: true,
        // Count active assets only — decommissioned ones are excluded from the
        // badge and drilldown (the drilldown API defaults to INSTALLED too).
        _count: { select: { assets: { where: { status: "INSTALLED" } } } },
      },
    }),
    prisma.manufacturer.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Asset Types</h1>
        <p className="text-muted-foreground mt-1">
          Manage asset types and configure Prometheus scrape templates for
          exporter-based monitoring.
        </p>
      </div>
      <AssetTypesClient initialTypes={types} manufacturers={manufacturers} />
    </div>
  );
}

export const metadata = { title: "Asset Types – SAM Admin" };
