import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { AssetDetailClient } from "@/components/assets/asset-detail-client";

export default async function AssetPage({
  params,
}: {
  params: Promise<{ id: string; assetId: string }>;
}) {
  const session = await auth();
  const { id: locationId, assetId } = await params;

  const templateSettings = await prisma.appSetting.findMany({
    where: { key: { in: ["hostname.urlTemplate", "macAddress.urlTemplate"] } },
  });
  const templateMap = Object.fromEntries(templateSettings.map((s) => [s.key, s.value]));
  const hostnameUrlTemplate = templateMap["hostname.urlTemplate"] || null;
  const macAddressUrlTemplate = templateMap["macAddress.urlTemplate"] || null;

  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    include: {
      type: true,
      manufacturer: true,
      supplier: true,
      macAddresses: true,
      customFields: true,
      location: { select: { id: true, name: true, parentId: true } },
      attachments: {
        include: { uploadedBy: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!asset || asset.locationId !== locationId) notFound();

  const breadcrumbs = await buildBreadcrumbs(locationId);

  // Owner / decommissioned-by are soft refs (no FK) — resolve names here so
  // deleted users degrade to a "(deleted user)" label client-side.
  const softRefIds = [asset.ownerId, asset.decommissionedById, asset.firmwareAttestedById].filter(
    (v): v is string => !!v
  );
  const softRefUsers = softRefIds.length
    ? await prisma.user.findMany({ where: { id: { in: softRefIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(softRefUsers.map((u) => [u.id, u.name]));

  return (
    <AssetDetailClient
      asset={asset}
      breadcrumbs={breadcrumbs}
      userRole={session?.user?.role || "VIEWER"}
      hostnameUrlTemplate={hostnameUrlTemplate}
      macAddressUrlTemplate={macAddressUrlTemplate}
      ownerName={asset.ownerId ? nameById.get(asset.ownerId) ?? null : null}
      decommissionedByName={asset.decommissionedById ? nameById.get(asset.decommissionedById) ?? null : null}
      firmwareAttestedByName={
        asset.firmwareAttestedById ? nameById.get(asset.firmwareAttestedById) ?? null : null
      }
    />
  );
}

async function buildBreadcrumbs(locationId: string): Promise<{ id: string; name: string }[]> {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { id: true, name: true, parentId: true },
  });
  if (!location) return [];
  if (!location.parentId) return [{ id: location.id, name: location.name }];
  const parents = await buildBreadcrumbs(location.parentId);
  return [...parents, { id: location.id, name: location.name }];
}

export async function generateMetadata({ params }: { params: Promise<{ id: string; assetId: string }> }) {
  const { assetId } = await params;
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { model: true, serialNumber: true },
  });
  const title = asset?.model || asset?.serialNumber || "Asset";
  return { title: `${title} – SAM` };
}
