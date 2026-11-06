/**
 * One-off migration: move the free-text "Quantity" custom field (created by
 * the legacy CSV import's QUANTITY column) onto the real Asset.quantity
 * column.
 *
 * For each custom field whose key is "quantity" (case-insensitive):
 *   - If the asset has a serial number, hostname, or MAC address, quantity
 *     must stay 1 (an individually-identified item can't have a bulk
 *     quantity) — the custom field is dropped and the row is flagged for
 *     manual review instead of being applied.
 *   - If the value isn't a positive integer, it's dropped and flagged.
 *   - Otherwise Asset.quantity is set to the parsed value.
 * The source custom field row is deleted once handled (applied or flagged)
 * so the script is idempotent — a second run finds nothing left to do.
 *
 * Usage: node --import tsx/esm scripts/migrate-quantity-custom-field.mjs [--dry-run]
 */
import "./_env.mjs";
import { prisma } from "@/lib/prisma";

const dryRun = process.argv.includes("--dry-run");

const customFields = await prisma.customField.findMany({
  select: {
    id: true,
    key: true,
    value: true,
    asset: {
      select: {
        id: true,
        model: { select: { name: true } },
        serialNumber: true,
        hostname: true,
        quantity: true,
        macAddresses: { select: { id: true } },
      },
    },
  },
});

const quantityFields = customFields.filter((f) => f.key.trim().toLowerCase() === "quantity");

console.log(`Found ${customFields.length} custom field row(s), ${quantityFields.length} with key "Quantity".`);

let applied = 0;
const flagged = [];

for (const f of quantityFields) {
  const asset = f.asset;
  const label = asset.model?.name ?? asset.id;
  const hasIdentity = !!asset.serialNumber || !!asset.hostname || asset.macAddresses.length > 0;
  const match = f.value.trim().match(/^(\d+)$/);
  const parsed = match ? parseInt(match[1], 10) : null;

  if (parsed === null || parsed < 1) {
    flagged.push(`  asset "${label}" (${asset.id}): value "${f.value}" is not a positive integer, left at quantity=${asset.quantity}.`);
  } else if (hasIdentity && parsed !== 1) {
    flagged.push(`  asset "${label}" (${asset.id}): has a serial/hostname/MAC, ignoring QUANTITY=${parsed} (left at quantity=${asset.quantity}).`);
  } else {
    console.log(`asset "${label}" (${asset.id}): quantity ${asset.quantity} -> ${parsed}`);
    if (!dryRun) {
      await prisma.asset.update({ where: { id: asset.id }, data: { quantity: parsed } });
    }
    applied++;
  }

  if (!dryRun) {
    await prisma.customField.delete({ where: { id: f.id } });
  }
}

console.log(`\nApplied ${applied} quantity update(s).`);
if (flagged.length > 0) {
  console.log(`${flagged.length} row(s) flagged for manual review (custom field removed, quantity left unset):`);
  for (const line of flagged) console.log(line);
}

if (dryRun) {
  console.log("\nDry run — no changes made. Re-run without --dry-run to apply.");
} else {
  console.log("\nDone.");
}

process.exit(0);
