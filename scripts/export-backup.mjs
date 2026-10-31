/**
 * scripts/export-backup.mjs
 *
 * Writes the import-compatible CSV export (GET /api/export/csv: installed
 * assets plus empty locations), the JSON inventory snapshot (GET
 * /api/export/snapshot: every asset, in any status) and a SHA-256 manifest to
 * a directory (or to S3 when STORAGE_DRIVER=s3 is configured). Both files come
 * from the same lib/ code as those endpoints. Suitable for use in cron jobs or
 * automated backup pipelines.
 *
 * Usage:
 *   node --import tsx/esm scripts/export-backup.mjs                         # use configured destination
 *   node --import tsx/esm scripts/export-backup.mjs --output /path/to/dir  # force local disk + override directory
 *   node --import tsx/esm scripts/export-backup.mjs --dry-run              # print row count only, no file written
 *
 * Destination resolution:
 *   1. --output flag      → always writes to local disk at the given directory.
 *   2. STORAGE_DRIVER=s3  → uploads to s3://$S3_BUCKET/$EXPORT_S3_PREFIX/<file>.csv.
 *   3. Default            → writes to local disk at the `export.outputDir` setting (default /backups).
 *
 * Run from the project root so that the .env file is found automatically.
 */

import "./_env.mjs";
import { getArg } from "./_args.mjs";
import { prisma } from "@/lib/prisma";
import { readExportSettings } from "@/lib/app-settings";
import { generateActiveAssetsCsv } from "@/lib/csv/export";
import { buildInventorySnapshot } from "@/lib/export/snapshot";
import { writeFile, mkdir } from "fs/promises";
import { resolve, join } from "path";
import { createHash } from "crypto";
import { getStorageDriver } from "@/lib/storage";

const dryRun = process.argv.includes("--dry-run");
const outputOverride = getArg("--output");

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Resolution: --output forces local disk; otherwise STORAGE_DRIVER=s3 picks
  // S3; otherwise local disk at the configured outputDir.
  const useS3 = !outputOverride && getStorageDriver().name === "s3";

  let outputDir = outputOverride ?? "";
  if (!useS3 && !outputDir) {
    outputDir = (await readExportSettings()).outputDir;
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

  const csv = await generateActiveAssetsCsv();
  const dataRows = csv.split("\r\n").length - 1; // subtract header
  const snapshot = await buildInventorySnapshot();
  const snapshotJson = JSON.stringify(snapshot, null, 2);

  if (dryRun) {
    console.log(`  Would write ${dataRows} CSV data rows (installed assets + empty locations)`);
    console.log(`  Would write JSON snapshot (${snapshot.counts.assets} assets, ${snapshot.counts.suppliers} suppliers) + manifest`);
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
    for (const out of outputs) {
      await getStorageDriver().putObject(`${normalizedPrefix}${out.name}`, out.body, out.contentType);
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
