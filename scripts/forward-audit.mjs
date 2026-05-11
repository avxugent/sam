/**
 * scripts/forward-audit.mjs
 *
 * Forwards every AuditLog row that hasn't yet been delivered to the
 * configured rsyslog server. Suitable for cron — run frequently to keep
 * the delivery lag short, e.g. `* * * * *` (every minute).
 *
 * Usage:
 *   node scripts/forward-audit.mjs              # forward all unforwarded rows
 *   node scripts/forward-audit.mjs --batch 500  # process up to N rows per run (default 1000)
 *   node scripts/forward-audit.mjs --dry-run    # report what would be sent, don't send
 *
 * Required env: SYSLOG_HOST (and the other SYSLOG_* vars from .env.example).
 *
 * Run from the project root so .env is found automatically.
 */

import "./_env.mjs";
import { PrismaClient } from "@prisma/client";
import { createSocket } from "dgram";
import { connect as netConnect } from "net";
import { connect as tlsConnect } from "tls";
import { readFileSync } from "fs";
import { hostname as osHostname } from "os";

const prisma = new PrismaClient();

// ── arg parsing ───────────────────────────────────────────────────────────────

function getArg(flag, defaultValue = null) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return defaultValue;
  return process.argv[idx + 1] ?? defaultValue;
}

const dryRun = process.argv.includes("--dry-run");
const batchSize = parseInt(getArg("--batch", "1000"), 10) || 1000;

// ── RFC 5424 formatter (mirrors lib/syslog.ts) ───────────────────────────────

const SEVERITY_INFO = 6;

function getFacility() {
  const n = parseInt(process.env.SYSLOG_FACILITY ?? "10", 10);
  return isNaN(n) || n < 0 || n > 23 ? 10 : n;
}

function escapeField(s) {
  return s.replace(/[^\x21-\x7e]/g, "_") || "-";
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return s; }
}

function formatRfc5424(entry) {
  const facility = getFacility();
  const pri = facility * 8 + SEVERITY_INFO;
  const ts = entry.timestamp.toISOString();
  const host = (process.env.SYSLOG_HOSTNAME || osHostname() || "-").slice(0, 255);
  const app = (process.env.SYSLOG_APP_NAME || "sam").slice(0, 48);
  const procid = String(process.pid).slice(0, 128);
  const msgid = entry.action.slice(0, 32);

  const payload = {
    id: entry.id,
    ts: ts,
    user: entry.userEmail ?? entry.userId ?? null,
    action: entry.action,
    entity: entry.entityType,
    entityId: entry.entityId,
    entityName: entry.entityName,
    ip: entry.ipAddress,
    detail: entry.detail ? safeParse(entry.detail) : null,
  };

  const msg = "﻿" + JSON.stringify(payload);
  return `<${pri}>1 ${ts} ${escapeField(host)} ${escapeField(app)} ${procid} ${escapeField(msgid)} - ${msg}`;
}

// ── transports ────────────────────────────────────────────────────────────────

function getPort(transport) {
  const fromEnv = process.env.SYSLOG_PORT;
  if (fromEnv) {
    const n = parseInt(fromEnv, 10);
    if (!isNaN(n) && n > 0 && n < 65536) return n;
  }
  return transport === "tls" ? 6514 : 514;
}

function getTimeoutMs() {
  const n = parseInt(process.env.SYSLOG_TIMEOUT_MS ?? "10000", 10);
  return isNaN(n) || n <= 0 ? 10000 : n;
}

function sendUdp(host, port, payloads, timeoutMs) {
  return new Promise((resolve, reject) => {
    const sock = createSocket("udp4");
    const timer = setTimeout(() => { sock.close(); reject(new Error("UDP timeout")); }, timeoutMs);
    let remaining = payloads.length;
    sock.on("error", (err) => { clearTimeout(timer); sock.close(); reject(err); });
    for (const p of payloads) {
      sock.send(Buffer.from(p, "utf8"), port, host, (err) => {
        if (err) { clearTimeout(timer); sock.close(); reject(err); return; }
        if (--remaining === 0) { clearTimeout(timer); sock.close(); resolve(); }
      });
    }
  });
}

function sendStream(kind, host, port, payloads, timeoutMs) {
  return new Promise((resolve, reject) => {
    const opts =
      kind === "tls"
        ? {
            host, port,
            ...(process.env.SYSLOG_CA_BUNDLE ? { ca: readFileSync(process.env.SYSLOG_CA_BUNDLE) } : {}),
            rejectUnauthorized: process.env.SYSLOG_TLS_REJECT_UNAUTHORIZED !== "false",
          }
        : { host, port };
    const socket = kind === "tls" ? tlsConnect(opts) : netConnect(opts);
    let timer = null;
    const finish = (err) => { if (timer) clearTimeout(timer); try { socket.end(); } catch {} if (err) reject(err); else resolve(); };
    socket.once("error", (err) => finish(err));
    socket.once(kind === "tls" ? "secureConnect" : "connect", () => {
      timer = setTimeout(() => socket.destroy(new Error(`${kind.toUpperCase()} timeout`)), timeoutMs);
      let pending = payloads.length;
      for (const p of payloads) {
        const buf = Buffer.from(p, "utf8");
        socket.write(`${buf.length} `, "utf8");
        socket.write(buf, (err) => {
          if (err) { finish(err); return; }
          if (--pending === 0) finish();
        });
      }
    });
  });
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.SYSLOG_HOST) {
    console.error("SYSLOG_HOST is not set. Configure it (and SYSLOG_TRANSPORT, etc.) before running this script.");
    process.exit(2);
  }

  const transport = (process.env.SYSLOG_TRANSPORT ?? "udp").toLowerCase();
  if (!["udp", "tcp", "tls"].includes(transport)) {
    console.error(`Unknown SYSLOG_TRANSPORT: ${transport} (expected udp | tcp | tls)`);
    process.exit(2);
  }

  const host = process.env.SYSLOG_HOST;
  const port = getPort(transport);
  const timeoutMs = getTimeoutMs();

  const rows = await prisma.auditLog.findMany({
    where: { forwardedAt: null },
    orderBy: { timestamp: "asc" },
    take: batchSize,
  });

  console.log("\nSAM — audit-log forwarder (catch-up)");
  console.log("─────────────────────────────────────────");
  console.log(`  Destination : ${transport}://${host}:${port}`);
  console.log(`  Pending     : ${rows.length} (cap ${batchSize})`);
  console.log(`  Dry run     : ${dryRun ? "YES" : "no"}`);
  console.log("");

  if (rows.length === 0) {
    console.log("✅  Nothing to forward.\n");
    return;
  }

  const payloads = rows.map(formatRfc5424);

  if (dryRun) {
    console.log("First payload preview:");
    console.log(payloads[0]);
    console.log(`\n${rows.length} row(s) would be forwarded.\n`);
    return;
  }

  try {
    if (transport === "udp") await sendUdp(host, port, payloads, timeoutMs);
    else await sendStream(transport, host, port, payloads, timeoutMs);
  } catch (err) {
    console.error(`\n❌  Forward failed: ${err.message ?? err}`);
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
