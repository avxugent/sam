import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getModelClusters } from "@/lib/model-clusters";
import { ModelsClient } from "@/components/settings/models-client";
import { canManageCatalog } from "@/lib/permissions";

export default async function ModelsPage({
  searchParams,
}: {
  searchParams: Promise<{ typeId?: string; manufacturerId?: string }>;
}) {
  const session = await auth();
  if (!session?.user || !canManageCatalog(session.user.role)) redirect("/");

  const { typeId, manufacturerId } = await searchParams;

  const [models, assetTypes, manufacturers, clusters] = await Promise.all([
    prisma.model.findMany({
      where: {
        ...(typeId ? { typeId } : {}),
        ...(manufacturerId ? { manufacturerId } : {}),
      },
      include: {
        type: { select: { id: true, name: true } },
        manufacturer: { select: { id: true, name: true } },
        // Decommissioned assets are historical, not current inventory — excluded
        // from the badge, same as the asset-types page.
        _count: { select: { assets: { where: { status: "INSTALLED" } }, stockItems: true } },
      },
      orderBy: [{ type: { name: "asc" } }, { manufacturer: { name: "asc" } }, { name: "asc" }],
    }),
    // Independent of the active filters, so the filter dropdowns' own option
    // lists never shrink just because another filter is applied.
    prisma.assetType.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.manufacturer.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    getModelClusters(),
  ]);

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Models</h1>
        <p className="text-muted-foreground mt-1">
          Fixed list of hardware models, scoped by asset type and manufacturer.
        </p>
      </div>
      <ModelsClient
        initialModels={models}
        assetTypes={assetTypes}
        manufacturers={manufacturers}
        initialClusters={clusters}
      />
    </div>
  );
}

export const metadata = { title: "Models – SAM Admin" };
