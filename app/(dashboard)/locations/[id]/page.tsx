import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { LocationDetailClient } from "@/components/locations/location-detail-client";
import { getAllDescendantLocationIds } from "@/lib/location-path";

async function getUrlTemplates(): Promise<{ hostnameUrlTemplate: string | null; macAddressUrlTemplate: string | null }> {
  const settings = await prisma.appSetting.findMany({
    where: { key: { in: ["hostname.urlTemplate", "macAddress.urlTemplate"] } },
  });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  return {
    hostnameUrlTemplate: map["hostname.urlTemplate"] || null,
    macAddressUrlTemplate: map["macAddress.urlTemplate"] || null,
  };
}

export default async function LocationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const { id } = await params;
  const { hostnameUrlTemplate, macAddressUrlTemplate } = await getUrlTemplates();

  const location = await prisma.location.findUnique({
    where: { id },
    include: {
      parent: { select: { id: true, name: true, parentId: true } },
      children: {
        include: { _count: { select: { assets: true, children: true } } },
        orderBy: [{ order: "asc" }, { name: "asc" }],
      },
      attachments: {
        include: { uploadedBy: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      },
      _count: { select: { assets: true, children: true, attachments: true } },
    },
  });

  if (!location) notFound();

  const breadcrumbs = await buildBreadcrumbs(id);

  const hasChildren = location._count.children > 0;
  const locationIds = hasChildren
    ? [id, ...(await getAllDescendantLocationIds(id))]
    : [id];

  const assets = await prisma.asset.findMany({
    where: { locationId: { in: locationIds } },
    include: {
      type: true,
      manufacturer: true,
      macAddresses: true,
      location: { select: { id: true, name: true } },
      _count: { select: { attachments: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <LocationDetailClient
      location={location}
      assets={assets}
      breadcrumbs={breadcrumbs}
      userRole={session?.user?.role || "VIEWER"}
      showLocation={hasChildren}
      hostnameUrlTemplate={hostnameUrlTemplate}
      macAddressUrlTemplate={macAddressUrlTemplate}
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

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const location = await prisma.location.findUnique({ where: { id }, select: { name: true } });
  return { title: location ? `${location.name} – SAM` : "Location – SAM" };
}
