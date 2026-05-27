import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveLocationPathsBatch } from "@/lib/location-path";
import type {
  ReportDefinition,
  ReportFilter,
  ReportRow,
  GroupCount,
  ReportResult,
} from "@/lib/report-types";

function yearsAgo(n: number): Date {
  return new Date(Date.now() - n * 365.25 * 24 * 60 * 60 * 1000);
}

export function translateFilters(filters: ReportFilter[]): Prisma.AssetWhereInput {
  const conditions: Prisma.AssetWhereInput[] = [];

  for (const f of filters) {
    const { field, op, value } = f;

    if (field === "typeId" || field === "manufacturerId" || field === "locationId") {
      if (op === "eq" && value) conditions.push({ [field]: value });
      else if (op === "neq" && value) conditions.push({ [field]: { not: value } });
      else if (op === "isNull") conditions.push({ [field]: null });
      else if (op === "isNotNull") conditions.push({ [field]: { not: null } });
      continue;
    }

    if (field === "model" || field === "serialNumber" || field === "hostname") {
      if (op === "eq" && value) conditions.push({ [field]: value });
      else if (op === "neq" && value) conditions.push({ [field]: { not: value } });
      else if (op === "contains" && value) conditions.push({ [field]: { contains: value } });
      else if (op === "isNull") conditions.push({ [field]: null });
      else if (op === "isNotNull") conditions.push({ [field]: { not: null } });
      continue;
    }

    if (field === "installationDate" || field === "invoiceDate") {
      if (op === "before" && value) {
        conditions.push({ [field]: { lt: new Date(value) } });
      } else if (op === "after" && value) {
        conditions.push({ [field]: { gt: new Date(value) } });
      } else if (op === "olderThanYears" && value) {
        const n = parseFloat(value);
        if (!isNaN(n)) conditions.push({ [field]: { lt: yearsAgo(n) } });
      } else if (op === "newerThanYears" && value) {
        const n = parseFloat(value);
        if (!isNaN(n)) conditions.push({ [field]: { gt: yearsAgo(n) } });
      } else if (op === "isNull") {
        conditions.push({ [field]: null });
      } else if (op === "isNotNull") {
        conditions.push({ [field]: { not: null } });
      }
      continue;
    }
  }

  return conditions.length === 0 ? {} : { AND: conditions };
}

export async function runReport(definition: ReportDefinition): Promise<ReportResult> {
  const where = translateFilters(definition.filters);

  const assets = await prisma.asset.findMany({
    where,
    include: {
      type: { select: { name: true } },
      manufacturer: { select: { name: true } },
      location: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  const uniqueLocationIds = [
    ...new Set(assets.map((a) => a.locationId).filter((id): id is string => id !== null)),
  ];
  const locationPathMap = await resolveLocationPathsBatch(uniqueLocationIds);

  const rows: ReportRow[] = assets.map((a) => ({
    id: a.id,
    model: a.model,
    serialNumber: a.serialNumber,
    hostname: a.hostname,
    type: a.type?.name ?? null,
    manufacturer: a.manufacturer?.name ?? null,
    location: a.locationId ? (locationPathMap.get(a.locationId) ?? a.location?.name ?? null) : null,
    locationId: a.locationId,
    installationDate: a.installationDate ? a.installationDate.toISOString().split("T")[0] : null,
    invoiceDate: a.invoiceDate ? a.invoiceDate.toISOString().split("T")[0] : null,
    invoiceNumber: a.invoiceNumber,
    notes: a.notes,
  }));

  let groups: GroupCount[] = [];

  if (definition.groupBy === "type") {
    const gb = await prisma.asset.groupBy({ by: ["typeId"], where, _count: { id: true } });
    const typeIds = gb.map((g) => g.typeId).filter(Boolean) as string[];
    const types = await prisma.assetType.findMany({ where: { id: { in: typeIds } }, select: { id: true, name: true } });
    const typeMap = Object.fromEntries(types.map((t) => [t.id, t.name]));
    groups = gb.map((g) => ({ label: g.typeId ? (typeMap[g.typeId] ?? "Unknown") : "No type", count: g._count.id }));
  } else if (definition.groupBy === "manufacturer") {
    const gb = await prisma.asset.groupBy({ by: ["manufacturerId"], where, _count: { id: true } });
    const mfIds = gb.map((g) => g.manufacturerId).filter(Boolean) as string[];
    const mfs = await prisma.manufacturer.findMany({ where: { id: { in: mfIds } }, select: { id: true, name: true } });
    const mfMap = Object.fromEntries(mfs.map((m) => [m.id, m.name]));
    groups = gb.map((g) => ({ label: g.manufacturerId ? (mfMap[g.manufacturerId] ?? "Unknown") : "No manufacturer", count: g._count.id }));
  } else if (definition.groupBy === "location") {
    const gb = await prisma.asset.groupBy({ by: ["locationId"], where, _count: { id: true } });
    const locIds = gb.map((g) => g.locationId).filter((id): id is string => id !== null);
    const groupPathMap = await resolveLocationPathsBatch(locIds);
    groups = gb.map((g) => ({
      label: g.locationId ? (groupPathMap.get(g.locationId) ?? "Unknown") : "No location",
      count: g._count.id,
    }));
  } else if (definition.groupBy === "installationYear") {
    const yearMap = new Map<string, number>();
    for (const a of assets) {
      const year = a.installationDate ? String(a.installationDate.getFullYear()) : "Unknown";
      yearMap.set(year, (yearMap.get(year) ?? 0) + 1);
    }
    groups = Array.from(yearMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, count]) => ({ label, count }));
  }

  groups.sort((a, b) => b.count - a.count);

  return { rows, groups, total: rows.length };
}
