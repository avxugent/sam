/**
 * scripts/purge-audit.mjs
 *
 * Deletes AuditLog rows older than the configured retention period
 * (AppSetting "audit.retentionDays", default 730 days). Suitable for cron,
 * e.g. daily: `0 3 * * *`.
 *
 * Safety rule: while syslog forwarding is configured (SYSLOG_HOST set),
 * rows that have not yet been forwarded (forwardedAt IS NULL) are NEVER
 * purged, no matter how old — run scripts/forward-audit.mjs first.
 *
 * Usage:
 *   node scripts/purge-audit.mjs               # purge expired rows
 *   node scripts/purge-audit.mjs --batch 5000  # delete up to N rows per run (default 10000)
 *   node scripts/purge-audit.mjs --dry-run     # report what would be deleted
 *
 * Run from the project root so .env is found automatically.
 */

import { prisma } from "./_prisma.mjs";

function getArg(flag, defaultValue = null) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return defaultValue;
  return process.argv[idx + 1] ?? defaultValue;
}

const dryRun = process.argv.includes("--dry-run");
const batchSize = parseInt(getArg("--batch", "10000"), 10) || 10000;

async function main() {
  const setting = await prisma.appSetting.findUnique({
    where: { key: "audit.retentionDays" },
  });
  const retentionDays = parseInt(setting?.value ?? "730", 10);
  if (isNaN(retentionDays) || retentionDays < 1) {
    console.error(`Invalid audit.retentionDays value: ${setting?.value}. Aborting.`);
    process.exit(2);
  }

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  // Mirrors isSyslogConfigured() in lib/syslog.ts
  const syslogConfigured = !!process.env.SYSLOG_HOST;

  const where = {
    timestamp: { lt: cutoff },
    ...(syslogConfigured ? { forwardedAt: { not: null } } : {}),
  };

  const purgeable = await prisma.auditLog.count({ where });
  const retainedUnforwarded = syslogConfigured
    ? await prisma.auditLog.count({
        where: { timestamp: { lt: cutoff }, forwardedAt: null },
      })
    : 0;

  console.log("\nSAM — audit-log retention purge");
  console.log("─────────────────────────────────────────");
  console.log(`  Retention   : ${retentionDays} days (cutoff ${cutoff.toISOString()})`);
  console.log(`  Syslog      : ${syslogConfigured ? "configured — unforwarded rows are kept" : "not configured"}`);
  console.log(`  Purgeable   : ${purgeable} (cap ${batchSize})`);
  if (retainedUnforwarded > 0) {
    console.warn(`  ⚠ Retained  : ${retainedUnforwarded} expired row(s) NOT purged because they were never forwarded to syslog. Run scripts/forward-audit.mjs.`);
  }
  console.log(`  Dry run     : ${dryRun ? "YES" : "no"}`);
  console.log("");

  if (purgeable === 0) {
    console.log("✅  Nothing to purge.\n");
    return;
  }

  if (dryRun) {
    console.log(`${Math.min(purgeable, batchSize)} row(s) would be deleted.\n`);
    return;
  }

  // deleteMany has no `take`, so select the batch's ids first.
  const rows = await prisma.auditLog.findMany({
    where,
    select: { id: true },
    orderBy: { timestamp: "asc" },
    take: batchSize,
  });
  const result = await prisma.auditLog.deleteMany({
    where: { id: { in: rows.map((r) => r.id) } },
  });

  console.log(`  ✓ Deleted ${result.count} row(s).`);
  if (purgeable > result.count) {
    console.log(`  ${purgeable - result.count} expired row(s) remain — rerun to continue.\n`);
  } else {
    console.log("");
  }
}

main()
  .catch((err) => {
    console.error("\n❌  Error:", err.message ?? err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
