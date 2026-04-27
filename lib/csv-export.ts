/**
 * CSV export logic — generates a CSV compatible with the CSV import format.
 * Used by the export API endpoint and the export-backup CLI script.
 */

import { prisma } from "@/lib/prisma";

const CUSTOM_FIELD_COLUMNS = [
  "GUID", "QUANTITY", "DIAGONAL", "WIDTH", "HEIGHT",
  "MIC_TYPE", "FREQUENCY", "ROOM_LOCATION", "INTEGRATOR", "CONTACTPERSOON",
];

const COLUMNS = [
  "CAMPUS", "GEBOUW", "LOKAAL", "FI NUMMER",
  "TYPE", "BRAND", "MODEL", "SERIAL", "MAC", "IP_HOSTNAME",
  "INSTALL_DATE", "Factuurdatum", "Factuurnummer",
  ...CUSTOM_FIELD_COLUMNS,
];

function escapeCsvCell(value: string): string {
  if (value.includes(";") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatDateCell(date: Date | null | undefined): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

type LocationRow = {
  id: string;
  name: string;
  fiNumber: string | null;
  parentId: string | null;
};

async function buildLocationHierarchy(locationId: string, locationMap: Map<string, LocationRow>): Promise<{ campus: string; building: string; room: string }> {
  const ancestors: LocationRow[] = [];
  let current: LocationRow | undefined = locationMap.get(locationId);
  while (current) {
    ancestors.unshift(current);
    current = current.parentId ? locationMap.get(current.parentId) : undefined;
  }
  // Determine levels by depth (up to 3 levels: campus, building, room)
  const [campus, building, room] = [
    ancestors[0]?.name ?? "",
    ancestors[1]?.name ?? "",
    ancestors[2]?.name ?? "",
  ];
  return { campus, building, room };
}

export async function generateExportCsv(): Promise<string> {
  // Fetch all locations into a map for hierarchy lookup
  const allLocations = await prisma.location.findMany({
    select: { id: true, name: true, fiNumber: true, parentId: true },
  });
  const locationMap = new Map<string, LocationRow>(allLocations.map((l) => [l.id, l]));

  // Fetch all assets with their relations
  const assets = await prisma.asset.findMany({
    include: {
      type: { select: { name: true } },
      manufacturer: { select: { name: true } },
      macAddresses: { select: { address: true } },
      customFields: { select: { key: true, value: true } },
      location: { select: { id: true, name: true, fiNumber: true, parentId: true } },
    },
    orderBy: [{ locationId: "asc" }, { createdAt: "asc" }],
  });

  const rows: string[] = [COLUMNS.join(";")];

  // Track locations that have assets so we can add asset-less locations at the end
  const locationsWithAssets = new Set<string>();

  for (const asset of assets) {
    const loc = asset.location;
    locationsWithAssets.add(loc.id);

    const hierarchy = await buildLocationHierarchy(loc.id, locationMap);
    const fiNumber = loc.fiNumber ?? "";

    const customFieldMap: Record<string, string> = {};
    for (const cf of asset.customFields) {
      customFieldMap[cf.key.toUpperCase()] = cf.value;
    }

    const macs = asset.macAddresses.map((m) => m.address).join(";");
    const installDate = formatDateCell(asset.installationDate ?? null);
    const invoiceDate = formatDateCell(asset.invoiceDate ?? null);

    const cells = [
      hierarchy.campus,
      hierarchy.building,
      hierarchy.room || loc.name,
      fiNumber,
      asset.type?.name ?? "",
      asset.manufacturer?.name ?? "",
      asset.model ?? "",
      asset.serialNumber ?? "",
      macs,
      asset.hostname ?? "",
      installDate,
      invoiceDate,
      asset.invoiceNumber ?? "",
      ...CUSTOM_FIELD_COLUMNS.map((col) => customFieldMap[col] ?? ""),
    ];

    rows.push(cells.map(escapeCsvCell).join(";"));
  }

  // Locations without assets: export as rows with empty asset fields
  for (const loc of allLocations) {
    if (locationsWithAssets.has(loc.id)) continue;
    // Only export leaf nodes or nodes with fiNumber (rooms)
    const hasChildren = allLocations.some((l) => l.parentId === loc.id);
    if (hasChildren) continue; // Skip non-leaf locations without assets

    const hierarchy = await buildLocationHierarchy(loc.id, locationMap);
    const fiNumber = loc.fiNumber ?? "";

    const cells = [
      hierarchy.campus,
      hierarchy.building,
      hierarchy.room || loc.name,
      fiNumber,
      "", "", "", "", "", "", "", "", "",
      ...CUSTOM_FIELD_COLUMNS.map(() => ""),
    ];
    rows.push(cells.map(escapeCsvCell).join(";"));
  }

  return rows.join("\r\n");
}
