/**
 * scripts/add-location-links.mjs
 *
 * Creates a link attachment on every location that has a fiNumber, pointing
 * to a configurable base URL. Defaults to the UGent lokalen portal.
 *
 * Usage:
 *   node --import tsx/esm scripts/add-location-links.mjs                    # process all locations with fiNumber
 *   node --import tsx/esm scripts/add-location-links.mjs --dry-run          # preview without writing
 *   node --import tsx/esm scripts/add-location-links.mjs --location-id <id> # single location
 *   node --import tsx/esm scripts/add-location-links.mjs --base-url https://custom.example.com/{fiNumber}
 *   node --import tsx/esm scripts/add-location-links.mjs --label "Custom label"
 *   node --import tsx/esm scripts/add-location-links.mjs --force            # overwrite existing link
 *   node --import tsx/esm scripts/add-location-links.mjs --user-id <id>     # specify uploader user ID
 *
 * The default base URL template is: https://lokalen.ugent.be/lokaal/{fiNumber}
 * Use {fiNumber} as the placeholder for the location's FI number.
 *
 * Run from the project root so that the .env file is found automatically.
 */

import "./_env.mjs";
import { prisma } from "@/lib/prisma";

// ── arg parsing ───────────────────────────────────────────────────────────────

function getArg(flag, defaultValue = null) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return defaultValue;
  return process.argv[idx + 1] ?? defaultValue;
}

const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");
const singleLocationId = getArg("--location-id");
const baseUrlTemplate = getArg("--base-url", "https://lokalen.ugent.be/lokaal/{fiNumber}");
const label = getArg("--label", "Lokalen UGent");
const userIdArg = getArg("--user-id");

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\nSAM — Add location links");
  console.log("─────────────────────────────────────────");
  console.log(`  Base URL template : ${baseUrlTemplate}`);
  console.log(`  Label             : ${label}`);
  console.log(`  Dry run           : ${dryRun ? "YES (no changes will be made)" : "no"}`);
  console.log(`  Force overwrite   : ${force}`);
  if (singleLocationId) console.log(`  Target location   : ${singleLocationId}`);
  console.log("");

  // Resolve uploader user ID
  let uploadedById = userIdArg;
  if (!uploadedById) {
    const adminUser = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
    if (!adminUser) {
      console.error("❌  No ADMIN user found. Provide --user-id to specify a user.");
      process.exit(1);
    }
    uploadedById = adminUser.id;
    console.log(`  Uploader          : ${adminUser.email} (${adminUser.id})\n`);
  }

  // Find target locations
  const where = { fiNumber: { not: null } };
  if (singleLocationId) where.id = singleLocationId;

  const locations = await prisma.location.findMany({
    where,
    select: { id: true, name: true, fiNumber: true },
    orderBy: { name: "asc" },
  });

  if (locations.length === 0) {
    console.log("No locations with fiNumber found.");
    return;
  }

  console.log(`Found ${locations.length} location(s) with fiNumber.\n`);

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const location of locations) {
    const url = baseUrlTemplate.replace("{fiNumber}", location.fiNumber);

    // Check for existing link with the same URL
    const existing = await prisma.attachment.findFirst({
      where: { locationId: location.id, attachmentType: "link", url },
    });

    if (existing && !force) {
      console.log(`  SKIP  ${location.name} (${location.fiNumber}) — link already exists`);
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`  WOULD CREATE  ${location.name} (${location.fiNumber}) → ${url}`);
      created++;
      continue;
    }

    try {
      if (existing && force) {
        await prisma.attachment.delete({ where: { id: existing.id } });
      }
      await prisma.attachment.create({
        data: {
          attachmentType: "link",
          url,
          originalName: label,
          locationId: location.id,
          uploadedById,
        },
      });
      console.log(`  ✓  ${location.name} (${location.fiNumber}) → ${url}`);
      created++;
    } catch (err) {
      console.error(`  ✗  ${location.name} (${location.fiNumber}) — ${err.message}`);
      errors++;
    }
  }

  console.log("\n─────────────────────────────────────────");
  if (dryRun) {
    console.log(`  Would create : ${created}`);
    console.log(`  Would skip   : ${skipped}`);
  } else {
    console.log(`  Created  : ${created}`);
    console.log(`  Skipped  : ${skipped}`);
    console.log(`  Errors   : ${errors}`);
  }
  console.log("");

  if (errors > 0) process.exit(1);
}

main()
  .catch((err) => {
    console.error("\n❌  Error:", err.message ?? err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
