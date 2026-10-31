import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { readGeneralSettings } from "@/lib/app-settings";
import { auth } from "@/lib/auth";
import { AssetDetailClient } from "@/components/assets/asset-detail-client";
import { locationBreadcrumbs } from "@/lib/locations/path";
import { ASSET_DETAIL_INCLUDE } from "@/lib/assets/include";
import { userNamesById } from "@/lib/user-names";


export default async function AssetPage({
  params,
}: {
  params: Promise<{ id: string; assetId: string }>;
}) {
  const session = await auth();
  const { id: locationId, assetId } = await params;

  const templates = await readGeneralSettings();
  const hostnameUrlTemplate = templates.hostnameUrlTemplate || null;
  const macAddressUrlTemplate = templates.macAddressUrlTemplate || null;

  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    include: ASSET_DETAIL_INCLUDE,
  });

  if (!asset || asset.locationId !== locationId) notFound();

  const breadcrumbs = await locationBreadcrumbs(locationId);

  // Owner / decommissioned-by are soft refs (no FK) — resolve names here so
  // deleted users degrade to a "(deleted user)" label client-side.
  const nameById = await userNamesById([asset.ownerId, asset.decommissionedById, asset.sentForRepairById]);

  return (
    <AssetDetailClient
      asset={asset}
      breadcrumbs={breadcrumbs}
      userRole={session?.user?.role || "VIEWER"}
      hostnameUrlTemplate={hostnameUrlTemplate}
      macAddressUrlTemplate={macAddressUrlTemplate}
      ownerName={asset.ownerId ? nameById.get(asset.ownerId) ?? null : null}
      decommissionedByName={asset.decommissionedById ? nameById.get(asset.decommissionedById) ?? null : null}
      sentForRepairByName={asset.sentForRepairById ? nameById.get(asset.sentForRepairById) ?? null : null}
    />
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string; assetId: string }> }) {
  const { assetId } = await params;
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { model: { select: { name: true } }, serialNumber: true },
  });
  const title = asset?.model?.name || asset?.serialNumber || "Asset";
  return { title: `${title} – SAM` };
}
