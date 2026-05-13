/**
 * scripts/export-backup.mjs
 *
 * Generates a CSV export of all SAM data and saves it to a file (or to S3
 * when STORAGE_DRIVER=s3 is configured). Suitable for use in cron jobs or
 * automated backup pipelines.
 *
 * Usage:
 *   node scripts/export-backup.mjs                         # use configured destination
 *   node scripts/export-backup.mjs --output /path/to/dir  # force local disk + override directory
 *   node scripts/export-backup.mjs --dry-run              # print row count only, no file written
 *
 * Destination resolution:
 *   1. --output flag      → always writes to local disk at the given directory.
 *   2. STORAGE_DRIVER=s3  → uploads to s3://$S3_BUCKET/$EXPORT_S3_PREFIX/<file>.csv.
 *   3. Default            → writes to local disk at AppSetting `export.outputDir` or `./exports`.
 *
 * Run from the project root so that the .env file is found automatically.
 */

import { prisma } from "./_prisma.mjs";
import { writeFile, mkdir } from "fs/promises";
import { resolve, join } from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

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
  // Resolution: --output forces local disk; otherwise STORAGE_DRIVER=s3 picks
  // S3; otherwise local disk at the configured outputDir.
  const useS3 =
    !outputOverride &&
    process.env.STORAGE_DRIVER === "s3" &&
    !!process.env.S3_BUCKET;

  let outputDir = outputOverride;
  if (!useS3 && !outputDir) {
    const setting = await prisma.appSetting.findUnique({ where: { key: "export.outputDir" } });
    outputDir = setting?.value || "./exports";
  }

  console.log("\nSAM — CSV export backup");
  console.log("─────────────────────────────────────────");
  if (useS3) {
    const prefix = process.env.EXPORT_S3_PREFIX || "backups/";
    console.log(`  Destination      : s3://${process.env.S3_BUCKET}/${prefix}`);
  } else {
    console.log(`  Output directory : ${outputDir}`);
  }
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

  if (useS3) {
    const bucket = process.env.S3_BUCKET;
    const prefix = (process.env.EXPORT_S3_PREFIX || "backups/").replace(/^\/+/, "");
    const normalizedPrefix = prefix.endsWith("/") || prefix === "" ? prefix : prefix + "/";
    const key = `${normalizedPrefix}${filename}`;
    const region = process.env.S3_REGION || "us-east-1";
    const client = new S3Client({
      region,
      ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
      ...(process.env.S3_FORCE_PATH_STYLE === "true" ? { forcePathStyle: true } : {}),
    });
    const body = Buffer.from(csv, "utf8");
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: "text/csv; charset=utf-8",
        ContentLength: body.length,
        ServerSideEncryption: "AES256",
      })
    );
    console.log(`  ✓ Uploaded ${dataRows} data rows to:`);
    console.log(`    s3://${bucket}/${key}`);
    console.log("");
    return;
  }

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
