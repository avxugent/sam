/**
 * scripts/forward-audit.mjs
 *
 * Forwards every AuditLog row that hasn't yet been delivered to the
 * configured rsyslog server. Suitable for cron — run frequently to keep
 * the delivery lag short, e.g. `* * * * *` (every minute).
 *
 * Usage:
 *   node --import tsx/esm scripts/forward-audit.mjs              # forward all unforwarded rows
 *   node --import tsx/esm scripts/forward-audit.mjs --batch 500  # process up to N rows per run (default 1000)
 *   node --import tsx/esm scripts/forward-audit.mjs --dry-run    # report what would be sent, don't send
 *
 * Required env: SYSLOG_HOST (and the other SYSLOG_* vars from .env.example).
 * Formatting and transport are lib/audit/syslog.ts, the same code that
 * forwards each entry live.
 *
 * Run from the project root so .env is found automatically.
 */

import "./_env.mjs";
import { getArg } from "./_args.mjs";
import { prisma } from "@/lib/prisma";
import { formatRfc5424, forwardAuditBatch, isSyslogConfigured, syslogDestination } from "@/lib/audit/syslog";

const dryRun = process.argv.includes("--dry-run");
const batchSize = parseInt(getArg("--batch", "1000"), 10) || 1000;

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!isSyslogConfigured()) {
    console.error("SYSLOG_HOST is not set. Configure it (and SYSLOG_TRANSPORT, etc.) before running this script.");
    process.exit(2);
  }

  const rows = await prisma.auditLog.findMany({
    where: { forwardedAt: null },
    orderBy: { timestamp: "asc" },
    take: batchSize,
  });

  console.log("\nSAM — audit-log forwarder (catch-up)");
  console.log("─────────────────────────────────────────");
  console.log(`  Destination : ${syslogDestination()}`);
  console.log(`  Pending     : ${rows.length} (cap ${batchSize})`);
  console.log(`  Dry run     : ${dryRun ? "YES" : "no"}`);
  console.log("");

  if (rows.length === 0) {
    console.log("✅  Nothing to forward.\n");
    return;
  }

  if (dryRun) {
    console.log("First payload preview:");
    console.log(formatRfc5424(rows[0]));
    console.log(`\n${rows.length} row(s) would be forwarded.\n`);
    return;
  }

  // forwardAuditBatch logs the failure reason itself.
  if (!(await forwardAuditBatch(rows))) {
    console.error("\n❌  Forward failed.");
    console.error("Rows remain marked as unforwarded; rerun once the server is reachable.\n");
    process.exit(1);
  }

  // Mark forwarded in chronological order so a partial failure on a future
  // run still preserves the "send oldest first" invariant.
  const ids = rows.map((r) => r.id);
  await prisma.auditLog.updateMany({
    where: { id: { in: ids } },
    data: { forwardedAt: new Date() },
  });

  console.log(`  ✓ Forwarded ${rows.length} row(s).\n`);
}

main()
  .catch((err) => {
    console.error("\n❌  Error:", err.message ?? err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
