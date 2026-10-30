import { Prisma } from "@/generated/prisma/client";
import { AssetStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { getLocationPathsBatch, getAncestorChainsBatch } from "@/lib/locations/path";
import { effectiveCriticality, parseCriticality } from "@/lib/criticality";
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
} from "@/lib/reports/types";
import { isLocationReport } from "@/lib/reports/types";
import { toIsoDay } from "@/lib/utils";

function periodCutoff(count: number, unit: "days" | "months" | "years"): Date {
  const d = new Date();
  if (unit === "days") d.setDate(d.getDate() - count);
  else if (unit === "months") d.setMonth(d.getMonth() - count);
  else d.setFullYear(d.getFullYear() - count);
  return d;
}

// Fractional counts ("1.5 years") are allowed in asset filters, so these
// offset by elapsed time; periodCutoff (whole calendar units) does not need to.
function yearsAgo(n: number): Date {
  return daysAgo(n * 365.25);
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

/** A numeric filter value, or null when it is missing or not a number. */
function numberOrNull(value: string | undefined): number | null {
  const n = value ? parseFloat(value) : NaN;
  return isNaN(n) ? null : n;
}

/**
 * eq / neq / contains / isNull / isNotNull on a scalar column; `contains` only
 * for text columns. Any other op (or a missing value) adds no condition.
 */
function scalarCondition(
  field: string,
  op: ReportFilter["op"],
  value: string | undefined,
  { text = false } = {}
): Prisma.AssetWhereInput | null {
  if (op === "isNull") return { [field]: null };
  if (op === "isNotNull") return { [field]: { not: null } };
  if (!value) return null;
  if (op === "eq") return { [field]: value };
  // SQL `<>` never matches NULL; "is not X" should still include rows with no value.
  if (op === "neq") return { OR: [{ [field]: { not: value } }, { [field]: null }] };
  if (op === "contains" && text) return { [field]: { contains: value } };
  return null;
}

/** Parses a before/after filter value; null for an unparseable date. */
function parseDate(value: string): Date | null {
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** before/after an absolute date, or older/newer than N days or years; null otherwise. */
function dateCondition(field: string, op: ReportFilter["op"], value: string | undefined): Prisma.AssetWhereInput | null {
  if (op === "before" || op === "after") {
    const d = value ? parseDate(value) : null;
    return d && { [field]: op === "before" ? { lt: d } : { gt: d } };
  }
  const n = numberOrNull(value);
  if (n === null) return null;
  if (op === "olderThanDays") return { [field]: { lt: daysAgo(n) } };
  if (op === "newerThanDays") return { [field]: { gt: daysAgo(n) } };
  if (op === "olderThanYears") return { [field]: { lt: yearsAgo(n) } };
  if (op === "newerThanYears") return { [field]: { gt: yearsAgo(n) } };
  return null;
}

/**
 * The status a status filter actually applies, or null when translateFilters
 * ignores it (an op other than eq/neq, or a value outside the enum) — so a
 * bad value can never widen the result set.
 */
function appliedStatus(f: ReportFilter): AssetStatus | null {
  if (f.field !== "status" || (f.op !== "eq" && f.op !== "neq")) return null;
  return Object.values(AssetStatus).find((s) => s === f.value) ?? null;
}

export function translateFilters(filters: ReportFilter[]): Prisma.AssetWhereInput {
  const conditions: Prisma.AssetWhereInput[] = [];

  for (const f of filters) {
    const { field, op, value } = f;

    if (field === "typeId" || field === "manufacturerId" || field === "locationId" || field === "supplierId") {
      const condition = scalarCondition(field, op, value);
      if (condition) conditions.push(condition);
      continue;
    }

    if (field === "criticality") {
      // Effective semantics: the per-asset override wins, otherwise the asset
      // type's default applies. Validate the value against the enum so a bad
      // value can never widen the result set (status-branch precedent).
      const level = value ? parseCriticality(value) : null;
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
      const status = appliedStatus(f);
      if (status && op === "eq") conditions.push({ status });
      else if (status && op === "neq") conditions.push({ status: { not: status } });
      continue;
    }

    if (field === "serialNumber" || field === "hostname") {
      const condition = scalarCondition(field, op, value, { text: true });
      if (condition) conditions.push(condition);
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

    if (field === "lastChanged" || field === "installationDate" || field === "invoiceDate" || field === "endOfSupportDate") {
      const column = field === "lastChanged" ? "updatedAt" : field;
      const condition = dateCondition(column, op, value) ?? scalarCondition(column, op, undefined);
      if (condition) conditions.push(condition);
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

/** Asset counts per value of `by`, labelled with the names `resolveNames` returns. */
async function countGroups(
  by: "typeId" | "manufacturerId" | "locationId",
  where: Prisma.AssetWhereInput,
  noneLabel: string,
  resolveNames: (ids: string[]) => Promise<Map<string, string>>
): Promise<GroupCount[]> {
  const rows = await prisma.asset.groupBy({ by: [by], where, _count: { id: true } });
  const keyed = rows.map((row) => ({ id: row[by] as string | null, count: row._count.id }));
  const names = await resolveNames(keyed.map((row) => row.id).filter((id): id is string => id !== null));
  return keyed.map(({ id, count }) => ({ label: id ? (names.get(id) ?? "Unknown") : noneLabel, count }));
}

async function namesById(rows: Promise<{ id: string; name: string }[]>): Promise<Map<string, string>> {
  return new Map((await rows).map((row) => [row.id, row.name]));
}

/** Most rows an asset report returns; `total` still counts every match. */
export const ASSET_REPORT_ROW_CAP = 5000;

export async function runAssetReport(definition: AssetReportDefinition): Promise<AssetReportResult> {
  // Decommissioned assets are historical, not current inventory — excluded by
  // default. Unlike the INSTALLED-only overviews, reports keep IN_REPAIR
  // assets. A report that is specifically about decommissioned assets (the
  // user added their own, applied, status filter) opts back in instead of
  // being silently overridden here.
  const hasStatusFilter = definition.filters.some((f) => appliedStatus(f) !== null);
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
    take: ASSET_REPORT_ROW_CAP,
  });
  // Rows are capped; the total and the groups always cover every match.
  const truncated = assets.length === ASSET_REPORT_ROW_CAP;
  const total = truncated ? await prisma.asset.count({ where }) : assets.length;

  const uniqueLocationIds = [
    ...new Set(assets.map((a) => a.locationId).filter((id): id is string => id !== null)),
  ];
  const locationPathMap = await getLocationPathsBatch(uniqueLocationIds);

  const rows: ReportRow[] = assets.map((a) => ({
    id: a.id,
    model: a.model?.name ?? null,
    serialNumber: a.serialNumber,
    hostname: a.hostname,
    type: a.type?.name ?? null,
    manufacturer: a.manufacturer?.name ?? null,
    location: a.locationId ? (locationPathMap.get(a.locationId) ?? a.location?.name ?? null) : null,
    locationId: a.locationId,
    installationDate: toIsoDay(a.installationDate),
    invoiceDate: toIsoDay(a.invoiceDate),
    invoiceNumber: a.invoiceNumber,
    notes: a.notes,
    lastChanged: toIsoDay(a.updatedAt),
    supplier: a.supplier?.name ?? null,
    criticality: effectiveCriticality(a.criticality, a.type?.defaultCriticality),
    endOfSupportDate: toIsoDay(a.endOfSupportDate),
  }));

  let groups: GroupCount[] = [];

  if (definition.groupBy === "type") {
    groups = await countGroups("typeId", where, "No type", (ids) =>
      namesById(prisma.assetType.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }))
    );
  } else if (definition.groupBy === "manufacturer") {
    groups = await countGroups("manufacturerId", where, "No manufacturer", (ids) =>
      namesById(prisma.manufacturer.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }))
    );
  } else if (definition.groupBy === "location") {
    groups = await countGroups("locationId", where, "No location", getLocationPathsBatch);
  } else if (definition.groupBy === "installationYear") {
    const yearMap = new Map<string, number>();
    const dated = truncated ? await prisma.asset.findMany({ where, select: { installationDate: true } }) : assets;
    for (const a of dated) {
      const year = a.installationDate ? String(a.installationDate.getFullYear()) : "Unknown";
      yearMap.set(year, (yearMap.get(year) ?? 0) + 1);
    }
    groups = Array.from(yearMap, ([label, count]) => ({ label, count }));
  }

  // Largest groups first (the viewer shows the top eight); ties by label.
  groups.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return { source: "asset", rows, groups, total };
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
  const chainsById = await getAncestorChainsBatch(allLeafIds);
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
        date: hit ? toIsoDay(hit.performedAt) : null,
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
