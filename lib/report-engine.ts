import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveLocationPathsBatch, resolveAncestorChainsBatch } from "@/lib/location-path";
import { effectiveCriticality } from "@/lib/criticality";
import type {
  ReportDefinition,
  AssetReportDefinition,
  LocationReportDefinition,
  ReportFilter,
  ReportRow,
  GroupCount,
  ReportResult,
  AssetReportResult,
  LocationReportResult,
  LocationReportRow,
} from "@/lib/report-types";
import { isLocationReport } from "@/lib/report-types";

function yearsAgo(n: number): Date {
  return new Date(Date.now() - n * 365.25 * 24 * 60 * 60 * 1000);
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function periodCutoff(count: number, unit: "days" | "months" | "years"): Date {
  const d = new Date();
  if (unit === "days") d.setDate(d.getDate() - count);
  else if (unit === "months") d.setMonth(d.getMonth() - count);
  else d.setFullYear(d.getFullYear() - count);
  return d;
}

export function translateFilters(filters: ReportFilter[]): Prisma.AssetWhereInput {
  const conditions: Prisma.AssetWhereInput[] = [];

  for (const f of filters) {
    const { field, op, value } = f;

    if (field === "typeId" || field === "manufacturerId" || field === "locationId" || field === "supplierId") {
      if (op === "eq" && value) conditions.push({ [field]: value });
      else if (op === "neq" && value) conditions.push({ [field]: { not: value } });
      else if (op === "isNull") conditions.push({ [field]: null });
      else if (op === "isNotNull") conditions.push({ [field]: { not: null } });
      continue;
    }

    if (field === "criticality") {
      // Effective semantics: the per-asset override wins, otherwise the asset
      // type's default applies. Validate the value against the enum so a bad
      // value can never widen the result set (status-branch precedent).
      const level =
        value === "LOW" || value === "MEDIUM" || value === "HIGH" || value === "CRITICAL"
          ? value
          : null;
      const unclassified: Prisma.AssetWhereInput = {
        criticality: null,
        OR: [{ typeId: null }, { type: { defaultCriticality: null } }],
      };
      if (op === "eq" && level) {
        conditions.push({
          OR: [
            { criticality: level },
            { criticality: null, type: { defaultCriticality: level } },
          ],
        });
      } else if (op === "neq" && level) {
        conditions.push({
          NOT: {
            OR: [
              { criticality: level },
              { criticality: null, type: { defaultCriticality: level } },
            ],
          },
        });
      } else if (op === "isNull") {
        conditions.push(unclassified);
      } else if (op === "isNotNull") {
        conditions.push({ NOT: unclassified });
      }
      continue;
    }

    if (field === "status") {
      // Only the enum members are valid; ignore anything else so a bad
      // value can never widen the result set.
      const status =
        value === "INSTALLED" || value === "IN_REPAIR" || value === "DECOMMISSIONED" ? value : null;
      if (status && op === "eq") conditions.push({ status });
      else if (status && op === "neq") conditions.push({ status: { not: status } });
      continue;
    }

    if (field === "serialNumber" || field === "hostname") {
      if (op === "eq" && value) conditions.push({ [field]: value });
      else if (op === "neq" && value) conditions.push({ [field]: { not: value } });
      else if (op === "contains" && value) conditions.push({ [field]: { contains: value } });
      else if (op === "isNull") conditions.push({ [field]: null });
      else if (op === "isNotNull") conditions.push({ [field]: { not: null } });
      continue;
    }

    if (field === "model") {
      if (op === "eq" && value) conditions.push({ model: { name: value } });
      else if (op === "neq" && value) conditions.push({ model: { isNot: { name: value } } });
      else if (op === "contains" && value) conditions.push({ model: { name: { contains: value } } });
      else if (op === "isNull") conditions.push({ modelId: null });
      else if (op === "isNotNull") conditions.push({ modelId: { not: null } });
      continue;
    }

    if (field === "workLogItem") {
      // "filled in" = the asset has at least one work-log entry referencing
      // this item; "not filled in" = it has none. Combine with a typeId filter
      // to track a work task across all assets of one type.
      if (op === "hasItem" && value) conditions.push({ workLogs: { some: { itemId: value } } });
      else if (op === "notHasItem" && value) conditions.push({ workLogs: { none: { itemId: value } } });
      continue;
    }

    if (field === "locationWorkLogItem") {
      // Same as workLogItem, but checks work-log entries against the asset's
      // *location* rather than the asset itself — e.g. "Recorders in a room
      // where this fixed task hasn't been logged", regardless of whether the
      // log entry names a specific asset or is location-wide.
      if (op === "hasItem" && value) conditions.push({ location: { workLogs: { some: { itemId: value } } } });
      else if (op === "notHasItem" && value) conditions.push({ location: { workLogs: { none: { itemId: value } } } });
      continue;
    }

    if (field === "lastChanged") {
      if (op === "newerThanDays" && value) {
        const n = parseFloat(value);
        if (!isNaN(n)) conditions.push({ updatedAt: { gt: daysAgo(n) } });
      } else if (op === "olderThanDays" && value) {
        const n = parseFloat(value);
        if (!isNaN(n)) conditions.push({ updatedAt: { lt: daysAgo(n) } });
      } else if (op === "before" && value) {
        conditions.push({ updatedAt: { lt: new Date(value) } });
      } else if (op === "after" && value) {
        conditions.push({ updatedAt: { gt: new Date(value) } });
      }
      continue;
    }

    if (field === "installationDate" || field === "invoiceDate" || field === "endOfSupportDate") {
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
  if (isLocationReport(definition)) {
    return runLocationReport(definition);
  }
  return runAssetReport(definition);
}

export async function runAssetReport(definition: AssetReportDefinition): Promise<AssetReportResult> {
  // Decommissioned assets are historical, not current inventory — excluded by
  // default, same as every other overview/report in the app. A report that is
  // specifically about decommissioned assets (the user added their own status
  // filter) opts back in instead of being silently overridden here.
  const hasStatusFilter = definition.filters.some((f) => f.field === "status");
  const baseWhere = translateFilters(definition.filters);
  const where: Prisma.AssetWhereInput = hasStatusFilter
    ? baseWhere
    : { AND: [baseWhere, { status: { not: "DECOMMISSIONED" } }] };

  const assets = await prisma.asset.findMany({
    where,
    include: {
      type: { select: { name: true, defaultCriticality: true } },
      manufacturer: { select: { name: true } },
      model: { select: { name: true } },
      supplier: { select: { name: true } },
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
    model: a.model?.name ?? null,
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
    lastChanged: a.updatedAt ? a.updatedAt.toISOString().split("T")[0] : null,
    supplier: a.supplier?.name ?? null,
    criticality: effectiveCriticality(a.criticality, a.type?.defaultCriticality),
    endOfSupportDate: a.endOfSupportDate ? a.endOfSupportDate.toISOString().split("T")[0] : null,
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

  return { source: "asset", rows, groups, total: rows.length };
}

/**
 * Builds a per-location coverage matrix for the selected fixed work-log items.
 * Rows are leaf locations (locations with no children). A location "has" an
 * item filled in when at least one work-log entry references that item.
 */
export async function runLocationReport(
  definition: LocationReportDefinition
): Promise<LocationReportResult> {
  const itemIds = [...new Set(definition.itemIds)];

  // Column headers, in the order the user selected them.
  const items = await prisma.workLogItem.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, name: true },
  });
  const itemNameById = new Map(items.map((i) => [i.id, i.name]));
  const itemColumns = itemIds
    .filter((id) => itemNameById.has(id))
    .map((id) => ({ id, name: itemNameById.get(id)! }));

  // Leaf locations only.
  const allLeaves = await prisma.location.findMany({
    where: { children: { none: {} } },
    select: { id: true, name: true, fiNumber: true },
  });
  const allLeafIds = allLeaves.map((l) => l.id);

  // Resolve the full ancestor chain (root → leaf, ids and names) for every
  // leaf in one query, so we can derive campus / building grouping labels,
  // the path string, and (optionally) whether a leaf falls in the selected
  // scope — all from a single tree walk.
  const chainsById = await resolveAncestorChainsBatch(allLeafIds);
  const ancestorsById = new Map(
    [...chainsById].map(([id, chain]) => [id, chain.names])
  );

  // Optional scope: restrict to leaves under one of the selected location
  // ids (any tree level). A leaf is in scope if its own id or any ancestor's
  // id is in the selected set.
  const scopeIds = definition.locationIds && definition.locationIds.length > 0
    ? new Set(definition.locationIds)
    : null;
  const leaves = scopeIds
    ? allLeaves.filter((l) =>
        (chainsById.get(l.id)?.ids ?? [l.id]).some((id) => scopeIds.has(id))
      )
    : allLeaves;
  const leafIds = leaves.map((l) => l.id);

  // Cutoff for the optional time window. "Filled" means the latest entry is on
  // or after this date; when no window is set, any entry counts.
  const cutoff = definition.periodCount && definition.periodUnit
    ? periodCutoff(definition.periodCount, definition.periodUnit)
    : null;

  // Latest work-log per (location, item). Ordered newest-first so the first
  // entry we see for each pair is the most recent.
  const logs = itemColumns.length === 0 || leafIds.length === 0
    ? []
    : await prisma.workLog.findMany({
        where: { itemId: { in: itemColumns.map((c) => c.id) }, locationId: { in: leafIds } },
        select: {
          locationId: true,
          itemId: true,
          performedAt: true,
          performedBy: { select: { name: true } },
        },
        orderBy: { performedAt: "desc" },
      });

  // locationId -> itemId -> latest entry
  const latest = new Map<string, Map<string, { performedAt: Date; performedBy: string | null }>>();
  for (const log of logs) {
    if (!log.itemId) continue;
    let perItem = latest.get(log.locationId);
    if (!perItem) {
      perItem = new Map();
      latest.set(log.locationId, perItem);
    }
    if (!perItem.has(log.itemId)) {
      perItem.set(log.itemId, {
        performedAt: log.performedAt,
        performedBy: log.performedBy?.name ?? null,
      });
    }
  }

  const allRows: LocationReportRow[] = leaves.map((loc) => {
    const perItem = latest.get(loc.id);
    const ancestors = ancestorsById.get(loc.id) ?? [loc.name];
    const itemsStatus: LocationReportRow["items"] = {};
    for (const col of itemColumns) {
      const hit = perItem?.get(col.id);
      // Within window (or ever, when no window) — but always surface the last date.
      const filled = !!hit && (!cutoff || hit.performedAt >= cutoff);
      itemsStatus[col.id] = {
        filled,
        date: hit ? hit.performedAt.toISOString().split("T")[0] : null,
        performedBy: hit?.performedBy ?? null,
      };
    }
    return {
      id: loc.id,
      locationId: loc.id,
      name: loc.name,
      path: ancestors.join(" - "),
      fiNumber: loc.fiNumber,
      campus: ancestors[0] ?? null,
      building: ancestors[1] ?? null,
      items: itemsStatus,
    };
  });

  // Group by campus, then building, then room name alphabetically.
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  allRows.sort((a, b) =>
    collator.compare(a.campus ?? "", b.campus ?? "") ||
    collator.compare(a.building ?? "", b.building ?? "") ||
    collator.compare(a.name, b.name)
  );

  const isFullyFilled = (row: LocationReportRow) =>
    itemColumns.length > 0 && itemColumns.every((c) => row.items[c.id]?.filled);

  const rows = allRows.filter((row) => {
    if (definition.status === "filled") return isFullyFilled(row);
    if (definition.status === "notFilled") return !isFullyFilled(row);
    return true;
  });

  const filledCount = allRows.filter(isFullyFilled).length;

  return {
    source: "location",
    itemColumns,
    rows,
    total: rows.length,
    filledCount,
    notFilledCount: allRows.length - filledCount,
  };
}
