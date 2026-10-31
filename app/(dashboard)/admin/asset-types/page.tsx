import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AssetTypesClient } from "@/components/admin/catalog/asset-types-client";
import { isAdmin } from "@/lib/permissions";

export default async function AssetTypesPage() {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) redirect("/");

  const t = await getTranslations("adminPages");

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
        <h1 className="text-2xl font-bold">{t("assetTypes.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("assetTypes.subtitle")}</p>
      </div>
      <AssetTypesClient initialTypes={types} manufacturers={manufacturers} />
    </div>
  );
}

export const metadata = { title: "Asset Types" };
