/**
 * scripts/add-attachment.mjs
 *
 * Generic CLI to programmatically add a link attachment to a location or asset.
 *
 * Usage:
 *   node --import tsx/esm scripts/add-attachment.mjs --location-id <id> --url <url> --label <label>
 *   node --import tsx/esm scripts/add-attachment.mjs --asset-id <id> --url <url> --label <label>
 *   node --import tsx/esm scripts/add-attachment.mjs ... --user-id <id>  # specify uploader (default: first ADMIN)
 *   node --import tsx/esm scripts/add-attachment.mjs ... --dry-run       # preview only
 *
 * Run from the project root so that the .env file is found automatically.
 */

import "./_env.mjs";
import { prisma } from "@/lib/prisma";

function getArg(flag, defaultValue = null) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return defaultValue;
  return process.argv[idx + 1] ?? defaultValue;
}

async function main() {
  const locationId = getArg("--location-id");
  const assetId = getArg("--asset-id");
  const url = getArg("--url");
  const label = getArg("--label");
  const userIdArg = getArg("--user-id");
  const dryRun = process.argv.includes("--dry-run");

  if (!url) { console.error("❌  --url is required"); process.exit(1); }
  if (!label) { console.error("❌  --label is required"); process.exit(1); }
  if (!locationId && !assetId) { console.error("❌  --location-id or --asset-id is required"); process.exit(1); }

  let uploadedById = userIdArg;
  if (!uploadedById) {
    const adminUser = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
    if (!adminUser) { console.error("❌  No ADMIN user found. Use --user-id."); process.exit(1); }
    uploadedById = adminUser.id;
  }

  if (locationId) {
    const loc = await prisma.location.findUnique({ where: { id: locationId }, select: { name: true } });
    if (!loc) { console.error(`❌  Location ${locationId} not found`); process.exit(1); }
    console.log(`Target: location "${loc.name}" (${locationId})`);
  } else {
    const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { model: true } });
    if (!asset) { console.error(`❌  Asset ${assetId} not found`); process.exit(1); }
    console.log(`Target: asset "${asset.model ?? assetId}" (${assetId})`);
  }

  console.log(`URL   : ${url}`);
  console.log(`Label : ${label}`);

  if (dryRun) {
    console.log("\nDry run — no changes made.");
    return;
  }

  await prisma.attachment.create({
    data: {
      attachmentType: "link",
      url,
      originalName: label,
      locationId: locationId || null,
      assetId: assetId || null,
      uploadedById,
    },
  });

  console.log("\n✅  Link attachment created.");
}

main()
  .catch((err) => {
    console.error("\n❌  Error:", err.message ?? err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
