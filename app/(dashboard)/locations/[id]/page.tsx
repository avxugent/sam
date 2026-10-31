import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { readGeneralSettings } from "@/lib/app-settings";
import { auth } from "@/lib/auth";
import { LocationDetailClient } from "@/components/locations/location-detail-client";
import { getAllDescendantLocationIds, locationBreadcrumbs } from "@/lib/locations/path";
import { withInstalledQuantities } from "@/lib/locations/asset-quantities";
import { jiraBaseUrl } from "@/lib/integrations/jira";
import { parseLocationTab } from "@/lib/users/preferences";
import { ASSET_LIST_INCLUDE } from "@/lib/assets/include";
import { WORK_LOG_INCLUDE } from "@/lib/work-logs/include";
import { LOCATION_PAGE_INCLUDE } from "@/lib/locations/include";


async function getUrlTemplates(): Promise<{
  hostnameUrlTemplate: string | null;
  locationUrlTemplate: string | null;
}> {
  const templates = await readGeneralSettings();
  return {
    hostnameUrlTemplate: templates.hostnameUrlTemplate || null,
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
  const { hostnameUrlTemplate, locationUrlTemplate } = await getUrlTemplates();

  const userPref = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { locationDefaultTab: true },
      })
    : null;
  const locationDefaultTab = userPref?.locationDefaultTab ?? "assets";

  const location = await prisma.location.findUnique({
    where: { id },
    include: LOCATION_PAGE_INCLUDE,
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

  const { location: locationWithQuantities, subtreeAssetCount } = await withInstalledQuantities(location, locationIds);

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
      jiraBaseUrl={jiraBaseUrl()}
    />
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const location = await prisma.location.findUnique({ where: { id }, select: { name: true } });
  return { title: location?.name ?? "Location" };
}
