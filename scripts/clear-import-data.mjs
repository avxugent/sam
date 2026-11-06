/**
 * scripts/clear-import-data.mjs
 *
 * Clears all assets (and their dependent rows) and all locations so that the
 * CSV import can be run from scratch on a clean slate.
 *
 * What is deleted:
 *   - attachments linked to assets or locations (files on disk + DB rows)
 *   - mac_addresses, custom_fields, custom_fields (cascade via Prisma)
 *   - assets
 *   - locations  (all levels — campus, building, floor, room)
 *
 * What is NOT deleted:
 *   - users
 *   - asset_types  (type list is kept — re-used on re-import)
 *   - manufacturers (same)
 *
 * Usage:
 *   node --import tsx/esm scripts/clear-import-data.mjs           # asks for confirmation
 *   node --import tsx/esm scripts/clear-import-data.mjs --force   # skips confirmation prompt
 *
 * Run from the project root so that the .env file is found automatically.
 */

import "./_env.mjs";
import { prisma } from "@/lib/prisma";
import { createInterface } from "readline";
import { deleteStoredFiles } from "@/lib/uploads/storage";
import { getSubtreeIdsDeepestFirst } from "@/lib/locations/path";

// ── helpers ──────────────────────────────────────────────────────────────────

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(question, (a) => { rl.close(); res(a); }));
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const force = process.argv.includes("--force");

  // Show what will be affected
  const [assetCount, locationCount, attachmentCount] = await Promise.all([
    prisma.asset.count(),
    prisma.location.count(),
    prisma.attachment.count(),
  ]);

  console.log("\n⚠️  SAM — Clear import data");
  console.log("─────────────────────────────────────────");
  console.log(`  Assets to delete:      ${assetCount}`);
  console.log(`  Locations to delete:   ${locationCount}`);
  console.log(`  Attachments to delete: ${attachmentCount}`);
  console.log("─────────────────────────────────────────");
  console.log("  Asset types and manufacturers are kept.");
  console.log("  Users are not affected.");
  console.log("");

  if (assetCount === 0 && locationCount === 0) {
    console.log("Nothing to delete — database is already empty.");
    return;
  }

  if (!force) {
    const answer = await ask("Type YES to confirm deletion: ");
    if (answer.trim() !== "YES") {
      console.log("Aborted.");
      return;
    }
  }

  console.log("\nDeleting…");

  // 1. Collect attachment file paths before deleting rows
  const attachments = await prisma.attachment.findMany({
    select: { path: true },
  });

  // 2. Delete in dependency order.
  //    Prisma's onDelete: Cascade handles mac_addresses, custom_fields,
  //    and asset attachments when assets are deleted, and location attachments
  //    when locations are deleted. We still delete attachments explicitly
  //    first so we can remove the files from disk.
  await prisma.attachment.deleteMany({});
  console.log(`  ✓ Removed ${attachments.length} attachment record(s) from DB`);

  // Remove the stored files (best-effort)
  const paths = attachments.flatMap((a) => (a.path ? [a.path] : []));
  await deleteStoredFiles(paths);
  if (paths.length > 0) {
    console.log(`  ✓ Removed ${paths.length} stored file(s)`);
  }

  // 3. Delete assets (cascades mac_addresses, custom_fields)
  const { count: deletedAssets } = await prisma.asset.deleteMany({});
  console.log(`  ✓ Deleted ${deletedAssets} asset(s)`);

  // 4. Delete all locations — parent is onDelete: Restrict, so each tree goes
  //    deepest first.
  const roots = await prisma.location.findMany({ where: { parentId: null }, select: { id: true } });
  let totalDeletedLocations = 0;
  for (const { id } of roots) {
    const ids = await getSubtreeIdsDeepestFirst(id);
    for (const locationId of ids) {
      totalDeletedLocations += (await prisma.location.deleteMany({ where: { id: locationId } })).count;
    }
  }
  console.log(`  ✓ Deleted ${totalDeletedLocations} location(s)`);

  // Sanity check
  const remaining = await prisma.location.count();
  if (remaining > 0) {
    console.warn(`  ⚠ ${remaining} location(s) could not be deleted (may have constraints)`);
  }

  console.log("\n✅  Done. Database is ready for a fresh CSV import.\n");
}

main()
  .catch((err) => {
    console.error("\n❌  Error:", err.message ?? err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
