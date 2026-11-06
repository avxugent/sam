/**
 * Every CSV the app produces (";"-delimited, CRLF line breaks): the
 * import-compatible inventory exports (export API endpoint and the
 * export-backup CLI script) plus the users, report and hostname-compliance
 * downloads.
 */

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { locationExportPathsBatch } from "@/lib/locations/path";
import { ancestorChain } from "@/lib/locations/tree";
import { escapeCsvCell } from "@/lib/csv/core";
import { toIsoDay } from "@/lib/dates";
import { stockMetadataMacs } from "@/lib/stock-metadata";
import { userNamesById } from "@/lib/users/names";
import { isLocationReport, type ReportResult } from "@/lib/reports/types";
import type { ColumnKey, ReportDefinition } from "@/lib/schemas/report";
import type { TypeCompliance } from "@/lib/compliance/hostname-report";
import { ASSET_CSV_COLUMNS, CUSTOM_FIELD_COLUMNS } from "@/lib/csv/columns";

/**
 * Owner is exported as email (unique + re-importable). Soft ref — deleted
 * owners fall back to the raw id.
 */
async function buildOwnerEmailMap(ownerIds: Array<string | null>): Promise<Map<string, string>> {
  const ids = [...new Set(ownerIds.filter((v): v is string => !!v))];
  if (ids.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, email: true },
  });
  return new Map(users.map((u) => [u.id, u.email]));
}

function formatDateCell(date: Date | null | undefined): string {
  return toIsoDay(date) ?? "";
}

type LocationRow = {
  id: string;
  name: string;
  fiNumber: string | null;
  parentId: string | null;
};

/** Names of the first three tree levels above (and including) the location. */
function buildLocationHierarchy(locationId: string, locationMap: Map<string, LocationRow>): { campus: string; building: string; room: string } {
  const [campus, building, room] = ancestorChain(locationId, locationMap).map((l) => l.name);
  return { campus: campus ?? "", building: building ?? "", room: room ?? "" };
}

const ASSET_EXPORT_INCLUDE = {
  type: { select: { name: true } },
  manufacturer: { select: { name: true } },
  model: { select: { name: true } },
  supplier: { select: { name: true } },
  macAddresses: { select: { address: true } },
  customFields: { select: { key: true, value: true } },
  location: { select: { id: true, name: true, fiNumber: true, parentId: true } },
} satisfies Prisma.AssetInclude;

type ExportAsset = Prisma.AssetGetPayload<{ include: typeof ASSET_EXPORT_INCLUDE }>;

/** CAMPUS, GEBOUW, LOKAAL, FI NUMMER for a location. */
function locationCells(loc: LocationRow, locationMap: Map<string, LocationRow>): string[] {
  const hierarchy = buildLocationHierarchy(loc.id, locationMap);
  return [hierarchy.campus, hierarchy.building, hierarchy.room || loc.name, loc.fiNumber ?? ""];
}

/** One cell per entry in ASSET_CSV_COLUMNS. */
function assetCells(
  asset: ExportAsset,
  locationMap: Map<string, LocationRow>,
  ownerEmailById: Map<string, string>
): string[] {
  // By custom field key (as the import stores it), case-insensitively.
  const customFieldByKey = new Map(asset.customFields.map((cf) => [cf.key.toLowerCase(), cf.value]));
  return [
    ...locationCells(asset.location, locationMap),
    asset.type?.name ?? "",
    asset.manufacturer?.name ?? "",
    asset.model?.name ?? "",
    asset.serialNumber ?? "",
    String(asset.quantity),
    asset.macAddresses.map((m) => m.address).join(";"),
    asset.hostname ?? "",
    formatDateCell(asset.installationDate),
    formatDateCell(asset.invoiceDate),
    asset.invoiceNumber ?? "",
    ...CUSTOM_FIELD_COLUMNS.map(({ key }) => customFieldByKey.get(key.toLowerCase()) ?? ""),
    asset.ownerId ? ownerEmailById.get(asset.ownerId) ?? asset.ownerId : "",
    asset.criticality ?? "",
    formatDateCell(asset.endOfSupportDate),
    asset.supplier?.name ?? "",
  ];
}

function csvLine(cells: string[]): string {
  return cells.map((cell) => escapeCsvCell(cell)).join(";");
}

function toCsv(header: string[], rows: string[][]): string {
  return [header, ...rows].map(csvLine).join("\r\n");
}

async function loadLocationMap(): Promise<Map<string, LocationRow>> {
  const locations = await prisma.location.findMany({
    select: { id: true, name: true, fiNumber: true, parentId: true },
  });
  return new Map(locations.map((l) => [l.id, l]));
}

/**
 * Import-compatible inventory export of installed assets only (in-repair and
 * decommissioned assets are not current inventory for re-import purposes and
 * have their own pages, decommissioned also its own export), plus one row with
 * empty asset fields per leaf location without installed assets.
 */
export async function generateActiveAssetsCsv(): Promise<string> {
  const locationMap = await loadLocationMap();

  const assets = await prisma.asset.findMany({
    where: { status: "INSTALLED" },
    include: ASSET_EXPORT_INCLUDE,
    orderBy: [{ locationId: "asc" }, { createdAt: "asc" }],
  });

  const ownerEmailById = await buildOwnerEmailMap(assets.map((a) => a.ownerId));

  const rows = assets.map((asset) => assetCells(asset, locationMap, ownerEmailById));

  // Leaf locations (rooms) without assets: export as rows with empty asset fields
  const locationsWithAssets = new Set(assets.map((a) => a.location.id));
  const parentIds = new Set([...locationMap.values()].map((l) => l.parentId));
  for (const loc of locationMap.values()) {
    if (locationsWithAssets.has(loc.id) || parentIds.has(loc.id)) continue;

    const cells = locationCells(loc, locationMap);
    rows.push([...cells, ...Array(ASSET_CSV_COLUMNS.length - cells.length).fill("")]);
  }

  return toCsv(ASSET_CSV_COLUMNS, rows);
}

const DECOMMISSIONED_COLUMNS = [
  ...ASSET_CSV_COLUMNS,
  "DECOMMISSIONED_AT", "DECOMMISSION_NOTE", "DISPOSAL_METHOD", "DECOMMISSIONED_BY", "LAST_LOCATION", "LAST_FI_NUMBER",
];

/**
 * CSV of the decommissioned asset list. Same core columns as the active export
 * plus the decommission metadata. Location columns reflect the asset's retained
 * location; the LAST_* columns are the snapshot captured at decommission time.
 */
export async function generateDecommissionedCsv(): Promise<string> {
  const locationMap = await loadLocationMap();

  const assets = await prisma.asset.findMany({
    where: { status: "DECOMMISSIONED" },
    include: ASSET_EXPORT_INCLUDE,
    orderBy: [{ decommissionedAt: "desc" }, { createdAt: "asc" }],
  });

  const ownerEmailById = await buildOwnerEmailMap(assets.map((a) => a.ownerId));

  // decommissionedById is a soft ref — resolve names in one batch; deleted
  // users fall back to the raw id so the evidence is never blank.
  const decommissionerNameById = await userNamesById(assets.map((a) => a.decommissionedById));

  const rows = assets.map((asset) => [
    ...assetCells(asset, locationMap, ownerEmailById),
    formatDateCell(asset.decommissionedAt),
    asset.decommissionNote ?? "",
    asset.disposalMethod ?? "",
    asset.decommissionedById
      ? decommissionerNameById.get(asset.decommissionedById) ?? asset.decommissionedById
      : "",
    asset.lastLocationName ?? "",
    asset.lastLocationFiNumber ?? "",
  ]);

  return toCsv(DECOMMISSIONED_COLUMNS, rows);
}

const STOCK_COLUMNS = [
  "TYPE", "BRAND", "MODEL", "SERIAL", "QUANTITY", "STORAGE_LOCATION",
  "RESERVED_FOR", "RESERVED_FI", "MAC", "NOTES", "INVOICE_DATE", "INVOICE_NUMBER",
];

/** CSV of the current stock inventory (StockItem table). */
export async function generateStockCsv(): Promise<string> {
  const items = await prisma.stockItem.findMany({
    include: {
      type: { select: { name: true } },
      manufacturer: { select: { name: true } },
      model: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const reservedIds = [
    ...new Set(
      items.map((i) => i.reservedForLocationId).filter((id): id is string => !!id)
    ),
  ];
  const storageIds = [
    ...new Set(items.map((i) => i.locationId).filter((id): id is string => !!id)),
  ];
  const pathMap = await locationExportPathsBatch([...new Set([...reservedIds, ...storageIds])]);
  const reservedLocations = reservedIds.length
    ? await prisma.location.findMany({
        where: { id: { in: reservedIds } },
        select: { id: true, fiNumber: true },
      })
    : [];
  const fiById = new Map(reservedLocations.map((l) => [l.id, l.fiNumber]));

  const rows = items.map((item) => {
    const storageLocation = item.locationId ? pathMap.get(item.locationId) ?? "" : "";
    const reservedFor = item.reservedForLocationId
      ? pathMap.get(item.reservedForLocationId) ?? ""
      : "";
    const reservedFi = item.reservedForLocationId
      ? fiById.get(item.reservedForLocationId) ?? ""
      : "";

    return [
      item.type?.name ?? "",
      item.manufacturer?.name ?? "",
      item.model?.name ?? "",
      item.serialNumber ?? "",
      String(item.quantity),
      storageLocation,
      reservedFor,
      reservedFi,
      stockMetadataMacs(item.metadata).join(";"),
      item.notes ?? "",
      formatDateCell(item.invoiceDate),
      item.invoiceNumber ?? "",
    ];
  });

  return toCsv(STOCK_COLUMNS, rows);
}

const USER_COLUMNS = [
  "NAME", "EMAIL", "ROLE", "PROVIDER",
  "2FA_ENABLED", "2FA_REQUIRED", "LAST_LOGIN",
];

/**
 * Access-review CSV of all user accounts (NIS2 periodic access review
 * evidence). Takes the rows so the API route controls the query/auth.
 */
export function generateUsersCsv(
  users: Array<{
    name: string;
    email: string;
    role: string;
    provider: string;
    totpEnabled: boolean;
    twoFactorRequired: boolean;
    lastLoginAt: Date | null;
  }>
): string {
  const rows = users.map((user) => [
    user.name,
    user.email,
    user.role,
    user.provider,
    user.totpEnabled ? "yes" : "no",
    user.twoFactorRequired ? "yes" : "no",
    user.lastLoginAt ? user.lastLoginAt.toISOString() : "",
  ]);

  return toCsv(USER_COLUMNS, rows);
}

const REPORT_COLUMN_LABELS: Record<ColumnKey, string> = {
  model: "Model",
  serialNumber: "Serial Number",
  hostname: "Hostname",
  type: "Type",
  manufacturer: "Manufacturer",
  location: "Location",
  installationDate: "Installation Date",
  invoiceDate: "Invoice Date",
  invoiceNumber: "Invoice Number",
  notes: "Notes",
  lastChanged: "Last Modified",
  supplier: "Supplier",
  criticality: "Criticality",
  endOfSupportDate: "End of Support",
};

/**
 * CSV of a saved report's result: the chosen columns of an asset report, or a
 * location report's review grid. Throws when the result is not the
 * definition's own (an asset result needs the definition's columns).
 */
export function generateReportCsv(definition: ReportDefinition, result: ReportResult): string {
  if (result.source === "location") {
    const header = ["Campus", "Building", "Room", "FI number", ...result.itemColumns.map((c) => c.name)];
    const rows = result.rows.map((row) => [
      row.campus ?? "",
      row.building ?? "",
      row.name,
      row.fiNumber ?? "",
      ...result.itemColumns.map((c) => {
        const status = row.items[c.id];
        if (status?.filled) return `Filled${status.date ? ` (${status.date})` : ""}`;
        return status?.date ? `Overdue (${status.date})` : "Not filled";
      }),
    ]);
    return toCsv(header, rows);
  }
  if (isLocationReport(definition)) throw new Error("Report result does not match its definition");
  const header = definition.columns.map((c) => REPORT_COLUMN_LABELS[c]);
  const rows = result.rows.map((row) => definition.columns.map((c) => (row[c] as string | null) ?? ""));
  return toCsv(header, rows);
}

const HOSTNAME_COMPLIANCE_COLUMNS = ["TYPE", "PATTERN", "HOSTNAME", "MODEL", "SERIAL", "LOCATION", "FI_NUMBER"];

/** CSV of every hostname that breaks its asset type's pattern (or the FQDN rule). */
export function generateHostnameComplianceCsv(types: TypeCompliance[]): string {
  const rows = types.flatMap((t) =>
    t.nonCompliantAssets.map((a) => [
      t.typeName,
      t.pattern ?? "",
      a.hostname,
      a.model ?? "",
      a.serialNumber ?? "",
      a.locationPath ?? "",
      a.fiNumber ?? "",
    ])
  );
  return toCsv(HOSTNAME_COMPLIANCE_COLUMNS, rows);
}
