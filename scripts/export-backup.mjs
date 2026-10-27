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
import { createHash } from "crypto";
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
  "OWNER", "CRITICALITY", "END_OF_SUPPORT", "SUPPLIER",
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
      supplier: { select: { name: true } },
      macAddresses: { select: { address: true } },
      customFields: { select: { key: true, value: true } },
      location: { select: { id: true, name: true, fiNumber: true, parentId: true } },
    },
    orderBy: [{ locationId: "asc" }, { createdAt: "asc" }],
  });

  // Owner is a soft ref exported as email (mirrors lib/csv/export.ts)
  const ownerIds = [...new Set(assets.map((a) => a.ownerId).filter(Boolean))];
  const owners = ownerIds.length
    ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, email: true } })
    : [];
  const ownerEmailById = new Map(owners.map((u) => [u.id, u.email]));

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
      asset.ownerId ? ownerEmailById.get(asset.ownerId) ?? asset.ownerId : "",
      asset.criticality ?? "",
      formatDate(asset.endOfSupportDate),
      asset.supplier?.name ?? "",
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

  // ── JSON inventory snapshot (mirrors lib/inventory-snapshot.ts) ──
  const suppliers = await prisma.supplier.findMany({ orderBy: { name: "asc" } });
  const snapshotLocations = await prisma.location.findMany({
    select: { id: true, name: true, parentId: true, fiNumber: true },
    orderBy: { name: "asc" },
  });
  const dateOnly = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
  const snapshot = {
    generatedAt: new Date().toISOString(),
    counts: { assets: assets.length, locations: snapshotLocations.length, suppliers: suppliers.length },
    assets: assets.map((a) => ({
      id: a.id,
      status: a.status,
      typeName: a.type?.name ?? null,
      manufacturerName: a.manufacturer?.name ?? null,
      model: a.model,
      serialNumber: a.serialNumber,
      hostname: a.hostname,
      macAddresses: a.macAddresses.map((m) => m.address),
      locationId: a.locationId,
      installationDate: dateOnly(a.installationDate),
      invoiceNumber: a.invoiceNumber,
      invoiceDate: dateOnly(a.invoiceDate),
      ownerId: a.ownerId,
      criticality: a.criticality,
      endOfSupportDate: dateOnly(a.endOfSupportDate),
      supplierId: a.supplierId,
      disposalMethod: a.disposalMethod,
      decommissionedAt: a.decommissionedAt ? new Date(a.decommissionedAt).toISOString() : null,
    })),
    suppliers: suppliers.map((s) => ({
      id: s.id,
      name: s.name,
      contractReference: s.contractReference,
      defaultFrom: dateOnly(s.defaultFrom),
      defaultUntil: dateOnly(s.defaultUntil),
    })),
    locations: snapshotLocations,
  };
  const snapshotJson = JSON.stringify(snapshot, null, 2);

  if (dryRun) {
    console.log(`  Would write ${dataRows} data rows (${assets.length} assets + empty locations)`);
    console.log(`  Would write JSON snapshot (${assets.length} assets, ${suppliers.length} suppliers) + manifest`);
    console.log("\n✅  Dry run complete — no file written.\n");
    return;
  }

  const date = new Date().toISOString().slice(0, 10);
  const filename = `sam-export-${date}.csv`;
  const snapshotFilename = `sam-inventory-${date}.json`;
  const manifestFilename = `sam-manifest-${date}.json`;

  const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
  const csvBody = Buffer.from(csv, "utf8");
  const snapshotBody = Buffer.from(snapshotJson, "utf8");
  const manifest = {
    generatedAt: snapshot.generatedAt,
    counts: snapshot.counts,
    files: [
      { name: filename, sha256: sha256(csvBody), bytes: csvBody.length },
      { name: snapshotFilename, sha256: sha256(snapshotBody), bytes: snapshotBody.length },
    ],
  };
  const manifestBody = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");

  const outputs = [
    { name: filename, body: csvBody, contentType: "text/csv; charset=utf-8" },
    { name: snapshotFilename, body: snapshotBody, contentType: "application/json; charset=utf-8" },
    { name: manifestFilename, body: manifestBody, contentType: "application/json; charset=utf-8" },
  ];

  if (useS3) {
    const bucket = process.env.S3_BUCKET;
    const prefix = (process.env.EXPORT_S3_PREFIX || "backups/").replace(/^\/+/, "");
    const normalizedPrefix = prefix.endsWith("/") || prefix === "" ? prefix : prefix + "/";
    const region = process.env.S3_REGION || "us-east-1";
    const client = new S3Client({
      region,
      ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
      ...(process.env.S3_FORCE_PATH_STYLE === "true" ? { forcePathStyle: true } : {}),
    });
    for (const out of outputs) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: `${normalizedPrefix}${out.name}`,
          Body: out.body,
          ContentType: out.contentType,
          ContentLength: out.body.length,
          ServerSideEncryption: "AES256",
        })
      );
    }
    console.log(`  ✓ Uploaded ${dataRows} data rows + snapshot + manifest to:`);
    console.log(`    s3://${bucket}/${normalizedPrefix}{${filename}, ${snapshotFilename}, ${manifestFilename}}`);
    console.log("");
    return;
  }

  const resolvedDir = resolve(process.cwd(), outputDir);
  await mkdir(resolvedDir, { recursive: true });
  for (const out of outputs) {
    await writeFile(join(resolvedDir, out.name), out.body);
  }

  console.log(`  ✓ Written ${dataRows} data rows + snapshot + manifest to:`);
  console.log(`    ${join(resolvedDir, filename)}`);
  console.log(`    ${join(resolvedDir, snapshotFilename)}`);
  console.log(`    ${join(resolvedDir, manifestFilename)}`);
  console.log("");
}

main()
  .catch((err) => {
    console.error("\n❌  Error:", err.message ?? err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
