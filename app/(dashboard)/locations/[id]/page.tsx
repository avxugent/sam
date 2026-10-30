import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { readGeneralSettings } from "@/lib/app-settings";
import { auth } from "@/lib/auth";
import { LocationDetailClient } from "@/components/locations/location-detail-client";
import { getAllDescendantLocationIds, locationBreadcrumbs } from "@/lib/locations/path";
import { isJiraConfigured } from "@/lib/jira";
import { parseLocationTab } from "@/lib/user-preferences";
import { ASSET_LIST_INCLUDE } from "@/lib/assets/include";
import { WORK_LOG_INCLUDE } from "@/lib/work-log-include";


async function getUrlTemplates(): Promise<{
  hostnameUrlTemplate: string | null;
  macAddressUrlTemplate: string | null;
  locationUrlTemplate: string | null;
}> {
  const templates = await readGeneralSettings();
  return {
    hostnameUrlTemplate: templates.hostnameUrlTemplate || null,
    macAddressUrlTemplate: templates.macAddressUrlTemplate || null,
    locationUrlTemplate: templates.locationUrlTemplate || null,
  };
}

export default async function LocationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const { id } = await params;
  const { hostnameUrlTemplate, macAddressUrlTemplate, locationUrlTemplate } = await getUrlTemplates();

  const userPref = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { locationDefaultTab: true },
      })
    : null;
  const locationDefaultTab = userPref?.locationDefaultTab ?? "assets";

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

  const breadcrumbs = await locationBreadcrumbs(id);

  const hasChildren = location._count.children > 0;
  const defaultTab = hasChildren ? parseLocationTab(locationDefaultTab) : "assets";
  const locationIds = hasChildren
    ? [id, ...(await getAllDescendantLocationIds(id))]
    : [id];

  const assets = await prisma.asset.findMany({
    where: { locationId: { in: locationIds }, status: "INSTALLED" },
    include: ASSET_LIST_INCLUDE,
    orderBy: { createdAt: "desc" },
  });

  // "Total assets" counts physical units (quantity), not asset rows, so a
  // bulk item like a box of 20 batteries counts as 20. Decommissioned assets
  // are historical, not current inventory, so they're excluded here too.
  const subtreeAssetQuantity = await prisma.asset.aggregate({
    where: { locationId: { in: locationIds }, status: "INSTALLED" },
    _sum: { quantity: true },
  });
  const subtreeAssetCount = subtreeAssetQuantity._sum.quantity ?? 0;

  const directQuantitySums = await prisma.asset.groupBy({
    by: ["locationId"],
    where: { locationId: { in: [location.id, ...location.children.map((c) => c.id)] }, status: "INSTALLED" },
    _sum: { quantity: true },
  });
  const directQuantityByLocationId = new Map(
    directQuantitySums.map((r) => [r.locationId, r._sum.quantity ?? 0])
  );
  const locationWithQuantities = {
    ...location,
    _count: { ...location._count, assets: directQuantityByLocationId.get(location.id) ?? 0 },
    children: location.children.map((c) => ({
      ...c,
      _count: { ...c._count, assets: directQuantityByLocationId.get(c.id) ?? 0 },
    })),
  };

  const workLogs = await prisma.workLog.findMany({
    where: { locationId: id },
    include: WORK_LOG_INCLUDE,
    orderBy: [{ performedAt: "desc" }, { createdAt: "desc" }],
  });

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  const workLogItems = await prisma.workLogItem.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: { id: true, name: true, description: true },
  });

  return (
    <LocationDetailClient
      location={locationWithQuantities}
      assets={assets}
      subtreeAssetCount={subtreeAssetCount}
      breadcrumbs={breadcrumbs}
      userRole={session?.user?.role || "VIEWER"}
      currentUserId={session?.user?.id ?? ""}
      showLocation={hasChildren}
      defaultTab={defaultTab}
      hostnameUrlTemplate={hostnameUrlTemplate}
      macAddressUrlTemplate={macAddressUrlTemplate}
      locationUrlTemplate={locationUrlTemplate}
      workLogs={workLogs.map((w) => ({
        id: w.id,
        performedAt: w.performedAt.toISOString(),
        description: w.description,
        jiraIssueKey: w.jiraIssueKey,
        performedBy: w.performedBy,
        item: w.item,
        asset: w.asset,
      }))}
      users={users.map((u) => ({ id: u.id, label: u.name + (u.email ? ` (${u.email})` : "") }))}
      workLogItems={workLogItems}
      jiraEnabled={isJiraConfigured()}
      jiraBaseUrl={process.env.JIRA_BASE_URL ?? null}
    />
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const location = await prisma.location.findUnique({ where: { id }, select: { name: true } });
  return { title: location ? `${location.name} – SAM` : "Location – SAM" };
}
