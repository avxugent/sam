import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { readGeneralSettings } from "@/lib/app-settings";
import { auth } from "@/lib/auth";
import { Role } from "@/lib/permissions";
import { AssetDetailClient } from "@/components/assets/asset-detail-client";
import { locationBreadcrumbs } from "@/lib/locations/path";
import { ASSET_DETAIL_INCLUDE } from "@/lib/assets/include";
import { userNamesById } from "@/lib/users/names";
import { assetLabel } from "@/lib/assets/label";


export default async function AssetPage({
  params,
}: {
  params: Promise<{ id: string; assetId: string }>;
}) {
  const session = await auth();
  const { id: locationId, assetId } = await params;

  const templates = await readGeneralSettings();

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
      userRole={session?.user?.role ?? Role.VIEWER}
      hostnameUrlTemplate={templates.hostnameUrlTemplate}
      macAddressUrlTemplate={templates.macAddressUrlTemplate}
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
    select: { model: { select: { name: true } }, hostname: true, serialNumber: true },
  });
  const title = asset && assetLabel(asset);
  if (title) return { title: title };
  const t = await getTranslations("asset");
  return { title: t("title") };
}
