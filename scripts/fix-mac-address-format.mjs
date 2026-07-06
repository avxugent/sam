/**
 * One-off cleanup: normalize all mac_addresses.address values to the
 * canonical AA:BB:CC:DD:EE:FF form (uppercase, colon-separated). Legacy
 * imports left a mix of formats: no separator, hyphen-separated, lowercase,
 * and Cisco dot-grouped (AABB.CCDD.EEFF).
 *
 * An address is normalized by stripping all separators/whitespace and
 * checking the remainder is exactly 12 hex digits — if so it's regrouped
 * into colon pairs. Anything else (wrong digit count, non-hex characters)
 * is left untouched and printed for manual review, since the true value
 * can't be reconstructed.
 *
 * Usage: node scripts/fix-mac-address-format.mjs [--dry-run]
 */
import { prisma } from "./_prisma.mjs";
import { normalizeMacAddress as normalize } from "../lib/mac-address.ts";

const dryRun = process.argv.includes("--dry-run");

const rows = await prisma.macAddress.findMany({
  select: { id: true, assetId: true, address: true },
});

const toFix = [];
const unrecoverable = [];

for (const r of rows) {
  const norm = normalize(r.address);
  if (norm === null) {
    unrecoverable.push(r);
  } else if (norm !== r.address) {
    toFix.push({ ...r, normalized: norm });
  }
}

console.log(`Found ${rows.length} MAC address row(s).`);
console.log(`${toFix.length} need reformatting.`);
console.log(`${unrecoverable.length} can't be safely normalized (left unchanged):`);
for (const r of unrecoverable) console.log(`  ${r.assetId}: "${r.address}"`);

for (const r of toFix) {
  console.log(`${r.id} (asset ${r.assetId}): "${r.address}" -> "${r.normalized}"`);
  if (!dryRun) {
    await prisma.macAddress.update({
      where: { id: r.id },
      data: { address: r.normalized },
    });
  }
}

if (dryRun) {
  console.log("Dry run — no changes made. Re-run without --dry-run to apply.");
} else {
  console.log(`Done. Reformatted ${toFix.length} MAC address(es).`);
}

process.exit(0);
