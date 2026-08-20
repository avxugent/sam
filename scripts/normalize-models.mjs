/**
 * One-off cleanup: normalize Asset.model spellings that differ only by
 * case, whitespace, or punctuation (e.g. "PowerEdge R740",
 * "poweredge r740", "PowerEdge  R740"). Groups all distinct model values by
 * a normalized key and, for any group with more than one distinct raw
 * spelling, rewrites every row in the group to a single canonical spelling
 * (the spelling used by the most assets; ties broken alphabetically).
 *
 * This only merges spellings that are byte-for-byte identical after
 * normalization — it does not attempt fuzzy/typo matching. Remaining
 * near-duplicates must be reviewed and merged manually via
 * Administration → Model Cleanup.
 *
 * Usage: node scripts/normalize-models.mjs [--dry-run]
 */
import { prisma } from "./_prisma.mjs";

const dryRun = process.argv.includes("--dry-run");

// Kept in sync with lib/model-similarity.ts's normalizeModelName().
// Duplicated (not imported) because scripts/ is deployed as an isolated
// bundle in Docker — see Dockerfile — and doesn't have access to the
// project's lib/.
function normalize(raw) {
  return raw.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

// Raw SQL grouped on BINARY model, not prisma.asset.groupBy({ by: ["model"] }):
// the assets table's default collation is case-insensitive, so a plain
// `GROUP BY model` would merge case-only variants (e.g. "PowerEdge R740" /
// "poweredge r740") into a single row at the SQL level before this script
// ever sees more than one spelling — silently skipping exactly the case
// differences this script exists to normalize.
const rows = await prisma.$queryRaw`
  SELECT ANY_VALUE(model) AS model, COUNT(*) AS count
  FROM assets
  WHERE model IS NOT NULL
  GROUP BY BINARY model
`;

const groups = new Map();
for (const r of rows) {
  const key = normalize(r.model);
  if (!key) continue;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push({ model: r.model, count: Number(r.count) });
}

let groupsChanged = 0;
let rowsUpdated = 0;

for (const [key, variants] of groups) {
  if (variants.length < 2) continue;

  const [canonical, ...rest] = [...variants].sort((a, b) =>
    b.count !== a.count
      ? b.count - a.count
      : a.model.localeCompare(b.model, undefined, { sensitivity: "base" })
  );

  console.log(`Group "${key}":`);
  console.log(`  canonical -> "${canonical.model}" (${canonical.count} asset(s))`);
  for (const variant of rest) {
    console.log(`  "${variant.model}" (${variant.count} asset(s)) -> "${canonical.model}"`);
    if (!dryRun) {
      await prisma.asset.updateMany({
        where: { model: variant.model },
        data: { model: canonical.model },
      });
    }
    rowsUpdated += variant.count;
  }
  groupsChanged++;
}

console.log(`Found ${groups.size} distinct normalized model name(s).`);
console.log(`${groupsChanged} group(s) had multiple spellings needing normalization.`);
if (dryRun) {
  console.log(
    `Dry run — no changes made. Would update ${rowsUpdated} asset row(s). Re-run without --dry-run to apply.`
  );
} else {
  console.log(`Done. Updated ${rowsUpdated} asset row(s) across ${groupsChanged} group(s).`);
}
process.exit(0);
