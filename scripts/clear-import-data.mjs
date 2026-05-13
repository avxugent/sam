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
 *   node scripts/clear-import-data.mjs           # asks for confirmation
 *   node scripts/clear-import-data.mjs --force   # skips confirmation prompt
 *
 * Run from the project root so that the .env file is found automatically.
 */

import { prisma } from "./_prisma.mjs";
import { createInterface } from "readline";
import { unlink } from "fs/promises";
import { resolve } from "path";

// ── helpers ──────────────────────────────────────────────────────────────────

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(question, (a) => { rl.close(); res(a); }));
}

async function tryDeleteFile(relativePath) {
  if (!relativePath) return;
  const uploadDir = process.env.UPLOAD_DIR ?? "./uploads";
  const fullPath = resolve(process.cwd(), uploadDir, relativePath);
  try {
    await unlink(fullPath);
  } catch {
    // File may already be gone — not fatal
  }
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

  // Remove files from disk (best-effort)
  let filesDeleted = 0;
  for (const { path } of attachments) {
    await tryDeleteFile(path);
    filesDeleted++;
  }
  if (filesDeleted > 0) {
    console.log(`  ✓ Removed ${filesDeleted} file(s) from disk`);
  }

  // 3. Delete assets (cascades mac_addresses, custom_fields)
  const { count: deletedAssets } = await prisma.asset.deleteMany({});
  console.log(`  ✓ Deleted ${deletedAssets} asset(s)`);

  // 4. Delete all locations — MySQL foreign key self-reference (parentId)
  //    means children must be deleted before parents.
  //    MySQL also disallows referencing the target table in a subquery of the
  //    same DELETE statement (error 1093), so we collect leaf IDs in JS first.
  let locationRound = 0;
  let totalDeletedLocations = 0;
  while (true) {
    locationRound++;

    // Find IDs of locations that are NOT referenced as a parent by any other
    // location — i.e., the current leaves of the tree.
    const leaves = await prisma.$queryRaw`
      SELECT l.id FROM locations l
      WHERE l.id NOT IN (
        SELECT DISTINCT p.parentId FROM locations p WHERE p.parentId IS NOT NULL
      )
    `;

    if (leaves.length === 0) break;

    // Delete this batch of leaves
    const ids = leaves.map((r) => r.id);
    const result = await prisma.location.deleteMany({
      where: { id: { in: ids } },
    });
    totalDeletedLocations += result.count;

    if (locationRound > 50) {
      // Safety valve — should never be needed in practice
      console.warn("  ⚠ Could not delete all locations after 50 passes");
      break;
    }
  }
  console.log(`  ✓ Deleted ${totalDeletedLocations} location(s) (${locationRound - 1} pass${locationRound - 1 !== 1 ? "es" : ""})`);

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
