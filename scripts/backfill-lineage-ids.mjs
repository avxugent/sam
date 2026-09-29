/**
 * One-off migration step: fill lineageId for existing assets and stock
 * items that predate the column. New rows get a lineageId automatically
 * (Prisma client default), but rows created before this field existed have
 * NULL. Assigns each a distinct crypto.randomUUID() — the exact shape
 * doesn't matter, it's an opaque grouping key for lineage tracking, not
 * user-facing.
 *
 * Run this after `prisma db push` adds the (nullable) lineageId column and
 * before tightening the schema to make it required.
 *
 * Usage: node scripts/backfill-lineage-ids.mjs [--dry-run]
 */
import { randomUUID } from "node:crypto";
import { prisma } from "./_prisma.mjs";

const dryRun = process.argv.includes("--dry-run");

const assets = await prisma.asset.findMany({
  where: { lineageId: null },
  select: { id: true },
});
const stockItems = await prisma.stockItem.findMany({
  where: { lineageId: null },
  select: { id: true },
});

console.log(`Found ${assets.length} asset(s) and ${stockItems.length} stock item(s) with no lineageId.`);

for (const a of assets) {
  const lineageId = randomUUID();
  console.log(`asset ${a.id}: lineageId -> ${lineageId}`);
  if (!dryRun) {
    await prisma.asset.update({ where: { id: a.id }, data: { lineageId } });
  }
}

for (const s of stockItems) {
  const lineageId = randomUUID();
  console.log(`stockItem ${s.id}: lineageId -> ${lineageId}`);
  if (!dryRun) {
    await prisma.stockItem.update({ where: { id: s.id }, data: { lineageId } });
  }
}

if (dryRun) {
  console.log("Dry run — no changes made. Re-run without --dry-run to apply.");
} else {
  console.log(`Done. Backfilled ${assets.length} asset(s) and ${stockItems.length} stock item(s).`);
}

process.exit(0);
