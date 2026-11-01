import { prisma } from "@/lib/prisma";
import { buildLocationPathsFromRows } from "@/lib/locations/path";

/**
 * The lookup lists the report builder offers (filter values, location scope,
 * work-log items), shared by the new-report and edit-report pages.
 */
export async function loadReportBuilderOptions() {
  const [assetTypes, manufacturers, locations, workLogItems, suppliers] = await Promise.all([
    prisma.assetType.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.manufacturer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.location.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, parentId: true } }),
    prisma.workLogItem.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const locationPaths = buildLocationPathsFromRows(locations);
  const locationScopeOptions = locations.map((l) => ({ id: l.id, name: locationPaths.get(l.id) ?? l.name }));

  return { assetTypes, manufacturers, locations, locationScopeOptions, workLogItems, suppliers };
}
