/**
 * One-off cleanup: some assets have serialNumber stored as scientific
 * notation text (e.g. "1,50304E+13"), a leftover from the legacy Excel
 * export used for the original CSV import. The mantissa only carries ~6
 * significant digits, so the true serial cannot be reconstructed from this
 * value alone — this script clears the field and preserves the original
 * (unreliable) value in a custom field for manual follow-up.
 *
 * Usage: node --import tsx/esm scripts/fix-scientific-notation-serials.mjs [--dry-run]
 */
import "./_env.mjs";
import { prisma } from "@/lib/prisma";

const SCI_NOTATION_RE = /^[0-9]+(?:[.,][0-9]+)?E\+?[0-9]+$/i;
const dryRun = process.argv.includes("--dry-run");

const assets = await prisma.asset.findMany({
  where: { serialNumber: { not: null } },
  select: { id: true, serialNumber: true },
});

const affected = assets.filter((a) => SCI_NOTATION_RE.test(a.serialNumber));

console.log(`Found ${affected.length} asset(s) with scientific-notation serial numbers.`);

for (const asset of affected) {
  console.log(`${asset.id}: "${asset.serialNumber}"`);
  if (dryRun) continue;

  await prisma.$transaction(async (tx) => {
    await tx.asset.update({
      where: { id: asset.id },
      data: { serialNumber: null },
    });
    await tx.customField.create({
      data: {
        assetId: asset.id,
        key: "Legacy serial (unverified)",
        value: asset.serialNumber,
      },
    });
  });
}

if (dryRun) {
  console.log("Dry run — no changes made. Re-run without --dry-run to apply.");
} else {
  console.log(`Done. Cleared ${affected.length} serial number(s).`);
}

process.exit(0);
