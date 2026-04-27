/**
 * scripts/export-backup.mjs
 *
 * Generates a CSV export of all SAM data and saves it to a file.
 * Suitable for use in cron jobs or automated backup pipelines.
 *
 * Usage:
 *   node scripts/export-backup.mjs                         # saves to configured outputDir
 *   node scripts/export-backup.mjs --output /path/to/dir  # override output directory
 *   node scripts/export-backup.mjs --dry-run              # print row count only, no file written
 *
 * Run from the project root so that the .env file is found automatically.
 */

import "./_env.mjs";
import { PrismaClient } from "@prisma/client";
import { writeFile, mkdir } from "fs/promises";
import { resolve, join } from "path";

const prisma = new PrismaClient();

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

function escapeCsvCell(value) {
  if (value.includes(";") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatDate(date) {
  if (!date) return "";
  return new Date(date).toISOString().slice(0, 10);
}

function buildAncestors(locationId, locationMap) {
  const ancestors = [];
  let current = locationMap.get(locationId);
  while (current) {
    ancestors.unshift(current);
    current = current.parentId ? locationMap.get(current.parentId) : undefined;
  }
  return ancestors;
}

// ── arg parsing ───────────────────────────────────────────────────────────────

function getArg(flag, defaultValue = null) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return defaultValue;
  return process.argv[idx + 1] ?? defaultValue;
}

const dryRun = process.argv.includes("--dry-run");
const outputOverride = getArg("--output");

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Determine output directory (arg > DB setting > default)
  let outputDir = outputOverride;
  if (!outputDir) {
    const setting = await prisma.appSetting.findUnique({ where: { key: "export.outputDir" } });
    outputDir = setting?.value || "./exports";
  }

  console.log("\nSAM — CSV export backup");
  console.log("─────────────────────────────────────────");
  console.log(`  Output directory : ${outputDir}`);
  console.log(`  Dry run          : ${dryRun ? "YES" : "no"}`);
  console.log("");

  const allLocations = await prisma.location.findMany({
    select: { id: true, name: true, fiNumber: true, parentId: true },
  });
  const locationMap = new Map(allLocations.map((l) => [l.id, l]));

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

  const rows = [COLUMNS.join(";")];
  const locationsWithAssets = new Set();

  for (const asset of assets) {
    const loc = asset.location;
    locationsWithAssets.add(loc.id);
    const ancestors = buildAncestors(loc.id, locationMap);
    const [campus, building, room] = [
      ancestors[0]?.name ?? "",
      ancestors[1]?.name ?? "",
      ancestors[2]?.name ?? "",
    ];

    const customFieldMap = {};
    for (const cf of asset.customFields) {
      customFieldMap[cf.key.toUpperCase()] = cf.value;
    }

    const cells = [
      campus,
      building,
      room || loc.name,
      loc.fiNumber ?? "",
      asset.type?.name ?? "",
      asset.manufacturer?.name ?? "",
      asset.model ?? "",
      asset.serialNumber ?? "",
      asset.macAddresses.map((m) => m.address).join(";"),
      asset.hostname ?? "",
      formatDate(asset.installationDate),
      formatDate(asset.invoiceDate),
      asset.invoiceNumber ?? "",
      ...CUSTOM_FIELD_COLUMNS.map((col) => customFieldMap[col] ?? ""),
    ];
    rows.push(cells.map(escapeCsvCell).join(";"));
  }

  // Leaf locations without assets
  for (const loc of allLocations) {
    if (locationsWithAssets.has(loc.id)) continue;
    const hasChildren = allLocations.some((l) => l.parentId === loc.id);
    if (hasChildren) continue;
    const ancestors = buildAncestors(loc.id, locationMap);
    const [campus, building, room] = [
      ancestors[0]?.name ?? "",
      ancestors[1]?.name ?? "",
      ancestors[2]?.name ?? "",
    ];
    const cells = [campus, building, room || loc.name, loc.fiNumber ?? "", ...Array(COLUMNS.length - 4).fill("")];
    rows.push(cells.map(escapeCsvCell).join(";"));
  }

  const csv = rows.join("\r\n");
  const dataRows = rows.length - 1; // subtract header

  if (dryRun) {
    console.log(`  Would write ${dataRows} data rows (${assets.length} assets + empty locations)`);
    console.log("\n✅  Dry run complete — no file written.\n");
    return;
  }

  const date = new Date().toISOString().slice(0, 10);
  const filename = `sam-export-${date}.csv`;
  const resolvedDir = resolve(process.cwd(), outputDir);
  await mkdir(resolvedDir, { recursive: true });
  const fullPath = join(resolvedDir, filename);
  await writeFile(fullPath, csv, "utf8");

  console.log(`  ✓ Written ${dataRows} data rows to:`);
  console.log(`    ${fullPath}`);
  console.log("");
}

main()
  .catch((err) => {
    console.error("\n❌  Error:", err.message ?? err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
