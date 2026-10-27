/**
 * CSV export logic — generates a CSV compatible with the CSV import format.
 * Used by the export API endpoint and the export-backup CLI script.
 */

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ancestorChain, resolveLocationPathsBatch } from "@/lib/location-path";
import { escapeCsvCell } from "@/lib/csv";
import { toIsoDay } from "@/lib/utils";
import { stockMetadataMacs } from "@/lib/stock-metadata";

const CUSTOM_FIELD_COLUMNS = [
  "GUID", "DIAGONAL", "WIDTH", "HEIGHT",
  "MIC_TYPE", "FREQUENCY", "ROOM_LOCATION", "INTEGRATOR", "CONTACTPERSOON",
];

const COLUMNS = [
  "CAMPUS", "GEBOUW", "LOKAAL", "FI NUMMER",
  "TYPE", "BRAND", "MODEL", "SERIAL", "QUANTITY", "MAC", "IP_HOSTNAME",
  "INSTALL_DATE", "Factuurdatum", "Factuurnummer",
  ...CUSTOM_FIELD_COLUMNS,
  "OWNER", "CRITICALITY", "END_OF_SUPPORT", "SUPPLIER",
];

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

/** One cell per entry in COLUMNS. */
function assetCells(
  asset: ExportAsset,
  locationMap: Map<string, LocationRow>,
  ownerEmailById: Map<string, string>
): string[] {
  const customFieldMap: Record<string, string> = {};
  for (const cf of asset.customFields) {
    customFieldMap[cf.key.toUpperCase()] = cf.value;
  }
  return [
    ...locationCells(asset.location, locationMap),
    asset.type?.name ?? "",
    asset.manufacturer?.name ?? "",
    asset.model?.name ?? "",
    asset.serialNumber ?? "",
    String(asset.quantity),
    asset.macAddresses.map((m) => m.address).join(";"),
    asset.hostname ?? "",
    formatDateCell(asset.installationDate ?? null),
    formatDateCell(asset.invoiceDate ?? null),
    asset.invoiceNumber ?? "",
    ...CUSTOM_FIELD_COLUMNS.map((col) => customFieldMap[col] ?? ""),
    asset.ownerId ? ownerEmailById.get(asset.ownerId) ?? asset.ownerId : "",
    asset.criticality ?? "",
    formatDateCell(asset.endOfSupportDate ?? null),
    asset.supplier?.name ?? "",
  ];
}

function csvLine(cells: string[]): string {
  return cells.map((cell) => escapeCsvCell(cell)).join(";");
}

export async function generateExportCsv(includeDecommissioned = false): Promise<string> {
  // Fetch all locations into a map for hierarchy lookup
  const allLocations = await prisma.location.findMany({
    select: { id: true, name: true, fiNumber: true, parentId: true },
  });
  const locationMap = new Map<string, LocationRow>(allLocations.map((l) => [l.id, l]));

  // Fetch assets — decommissioned excluded by default
  const assets = await prisma.asset.findMany({
    where: includeDecommissioned ? {} : { status: "INSTALLED" },
    include: ASSET_EXPORT_INCLUDE,
    orderBy: [{ locationId: "asc" }, { createdAt: "asc" }],
  });

  const ownerEmailById = await buildOwnerEmailMap(assets.map((a) => a.ownerId));

  const rows: string[] = [COLUMNS.join(";")];

  // Track locations that have assets so we can add asset-less locations at the end
  const locationsWithAssets = new Set<string>();

  for (const asset of assets) {
    locationsWithAssets.add(asset.location.id);
    rows.push(csvLine(assetCells(asset, locationMap, ownerEmailById)));
  }

  // Leaf locations (rooms) without assets: export as rows with empty asset fields
  const parentIds = new Set(allLocations.map((l) => l.parentId));
  for (const loc of allLocations) {
    if (locationsWithAssets.has(loc.id) || parentIds.has(loc.id)) continue;

    const cells = locationCells(loc, locationMap);
    rows.push(csvLine([...cells, ...Array(COLUMNS.length - cells.length).fill("")]));
  }

  return rows.join("\r\n");
}

const DECOMMISSIONED_COLUMNS = [
  ...COLUMNS,
  "DECOMMISSIONED_AT", "DECOMMISSION_NOTE", "DISPOSAL_METHOD", "DECOMMISSIONED_BY", "LAST_LOCATION", "LAST_FI_NUMBER",
];

/**
 * CSV of the decommissioned asset list. Same core columns as the active export
 * plus the decommission metadata. Location columns reflect the asset's retained
 * location; the LAST_* columns are the snapshot captured at decommission time.
 */
export async function generateDecommissionedCsv(): Promise<string> {
  const allLocations = await prisma.location.findMany({
    select: { id: true, name: true, fiNumber: true, parentId: true },
  });
  const locationMap = new Map<string, LocationRow>(allLocations.map((l) => [l.id, l]));

  const assets = await prisma.asset.findMany({
    where: { status: "DECOMMISSIONED" },
    include: ASSET_EXPORT_INCLUDE,
    orderBy: [{ decommissionedAt: "desc" }, { createdAt: "asc" }],
  });

  const ownerEmailById = await buildOwnerEmailMap(assets.map((a) => a.ownerId));

  // decommissionedById is a soft ref — resolve names in one batch; deleted
  // users fall back to the raw id so the evidence is never blank.
  const decommissionerIds = [...new Set(assets.map((a) => a.decommissionedById).filter((v): v is string => !!v))];
  const decommissioners = decommissionerIds.length
    ? await prisma.user.findMany({ where: { id: { in: decommissionerIds } }, select: { id: true, name: true } })
    : [];
  const decommissionerNameById = new Map(decommissioners.map((u) => [u.id, u.name]));

  const rows: string[] = [DECOMMISSIONED_COLUMNS.join(";")];

  for (const asset of assets) {
    rows.push(
      csvLine([
        ...assetCells(asset, locationMap, ownerEmailById),
        formatDateCell(asset.decommissionedAt ?? null),
        asset.decommissionNote ?? "",
        asset.disposalMethod ?? "",
        asset.decommissionedById
          ? decommissionerNameById.get(asset.decommissionedById) ?? asset.decommissionedById
          : "",
        asset.lastLocationName ?? "",
        asset.lastLocationFiNumber ?? "",
      ])
    );
  }

  return rows.join("\r\n");
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
  const pathMap = await resolveLocationPathsBatch([...new Set([...reservedIds, ...storageIds])]);
  const reservedLocations = reservedIds.length
    ? await prisma.location.findMany({
        where: { id: { in: reservedIds } },
        select: { id: true, fiNumber: true },
      })
    : [];
  const fiById = new Map(reservedLocations.map((l) => [l.id, l.fiNumber]));

  const rows: string[] = [STOCK_COLUMNS.join(";")];

  for (const item of items) {
    const storageLocation = item.locationId ? pathMap.get(item.locationId) ?? "" : "";
    const reservedFor = item.reservedForLocationId
      ? pathMap.get(item.reservedForLocationId) ?? ""
      : "";
    const reservedFi = item.reservedForLocationId
      ? fiById.get(item.reservedForLocationId) ?? ""
      : "";

    const cells = [
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
      formatDateCell(item.invoiceDate ?? null),
      item.invoiceNumber ?? "",
    ];

    rows.push(csvLine(cells));
  }

  return rows.join("\r\n");
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
  const rows: string[] = [USER_COLUMNS.join(";")];

  for (const user of users) {
    const cells = [
      user.name,
      user.email,
      user.role,
      user.provider,
      user.totpEnabled ? "yes" : "no",
      user.twoFactorRequired ? "yes" : "no",
      user.lastLoginAt ? user.lastLoginAt.toISOString() : "",
    ];
    rows.push(csvLine(cells));
  }

  return rows.join("\r\n");
}
