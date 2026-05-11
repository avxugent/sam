/**
 * Audit-log forwarder for rsyslog (RFC 5424).
 *
 * Configuration via env vars:
 *
 *   SYSLOG_HOST                       — rsyslog server hostname/IP. If unset,
 *                                       forwarding is disabled.
 *   SYSLOG_PORT                       — default 514 (UDP/TCP) or 6514 (TLS).
 *   SYSLOG_TRANSPORT                  — "udp" (default), "tcp", or "tls".
 *   SYSLOG_APP_NAME                   — APP-NAME field, default "sam".
 *   SYSLOG_HOSTNAME                   — HOSTNAME field, default os.hostname().
 *   SYSLOG_FACILITY                   — numeric, default 10 (security/auth).
 *                                       16-23 = local0..local7.
 *   SYSLOG_TIMEOUT_MS                 — connect/send timeout, default 3000.
 *   SYSLOG_CA_BUNDLE                  — TLS only — path to a CA bundle PEM.
 *   SYSLOG_TLS_REJECT_UNAUTHORIZED    — TLS only — "false" disables cert
 *                                       verification (dev/self-signed only).
 *
 * All public functions are best-effort: errors are caught and surfaced as a
 * boolean return value so the audit pipeline can never crash a request.
 */

import { createSocket } from "dgram";
import { connect as netConnect } from "net";
import { connect as tlsConnect } from "tls";
import { readFileSync } from "fs";
import { hostname as osHostname } from "os";

export type AuditEntryForSyslog = {
  id: string;
  timestamp: Date;
  userId: string | null;
  userEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  entityName: string | null;
  detail: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

const SEVERITY_INFO = 6;
const DEFAULT_FACILITY = 10; // security/authorization
const DEFAULT_PORT = 514;
const DEFAULT_TLS_PORT = 6514;
const DEFAULT_TIMEOUT_MS = 3000;

function parseTransport(): "udp" | "tcp" | "tls" {
  const t = (process.env.SYSLOG_TRANSPORT ?? "udp").toLowerCase();
  if (t === "udp" || t === "tcp" || t === "tls") return t;
  return "udp";
}

function getPort(): number {
  const fromEnv = process.env.SYSLOG_PORT;
  if (fromEnv) {
    const n = parseInt(fromEnv, 10);
    if (!isNaN(n) && n > 0 && n < 65536) return n;
  }
  return parseTransport() === "tls" ? DEFAULT_TLS_PORT : DEFAULT_PORT;
}

function getFacility(): number {
  const fromEnv = process.env.SYSLOG_FACILITY;
  if (fromEnv) {
    const n = parseInt(fromEnv, 10);
    if (!isNaN(n) && n >= 0 && n <= 23) return n;
  }
  return DEFAULT_FACILITY;
}

function getTimeoutMs(): number {
  const fromEnv = process.env.SYSLOG_TIMEOUT_MS;
  if (fromEnv) {
    const n = parseInt(fromEnv, 10);
    if (!isNaN(n) && n > 0) return n;
  }
  return DEFAULT_TIMEOUT_MS;
}

export function isSyslogConfigured(): boolean {
  return !!process.env.SYSLOG_HOST;
}

/**
 * Build an RFC 5424 message:
 *   <PRI>1 TIMESTAMP HOSTNAME APP-NAME PROCID MSGID - MSG
 * where MSG is a JSON object with the audit entry fields. The "-" is the
 * NILVALUE for STRUCTURED-DATA — downstream parsers can pick fields out of
 * the JSON instead.
 */
export function formatRfc5424(entry: AuditEntryForSyslog): string {
  const facility = getFacility();
  const pri = facility * 8 + SEVERITY_INFO;
  const ts = entry.timestamp.toISOString(); // RFC 5424 accepts ISO 8601
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

  // RFC 5424 MSG field: prefix with BOM to signal UTF-8 to syslog parsers.
  const msg = "﻿" + JSON.stringify(payload);

  return `<${pri}>1 ${ts} ${escapeField(host)} ${escapeField(app)} ${procid} ${escapeField(msgid)} - ${msg}`;
}

function escapeField(s: string): string {
  // RFC 5424 disallows spaces in HOSTNAME / APP-NAME / MSGID / PROCID.
  // Replace anything outside printable ASCII (excluding space) with "_".
  return s.replace(/[^\x21-\x7e]/g, "_") || "-";
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}

// ── Transports ───────────────────────────────────────────────────────────────

async function sendUdp(host: string, port: number, payloads: string[], timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const sock = createSocket("udp4");
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { sock.close(); } catch { /* already closed */ }
      if (err) reject(err); else resolve();
    };
    const timer = setTimeout(() => finish(new Error("UDP send timed out")), timeoutMs);

    let remaining = payloads.length;
    if (remaining === 0) {
      finish();
      return;
    }

    sock.on("error", finish);

    for (const p of payloads) {
      sock.send(Buffer.from(p, "utf8"), port, host, (err) => {
        if (settled) return;
        if (err) { finish(err); return; }
        if (--remaining === 0) finish();
      });
    }
  });
}

async function sendStream(
  kind: "tcp" | "tls",
  host: string,
  port: number,
  payloads: string[],
  timeoutMs: number
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let timer: NodeJS.Timeout | null = null;
    let settled = false;
    const armTimer = () => {
      timer = setTimeout(() => {
        socket.destroy(new Error(`${kind.toUpperCase()} send timed out`));
      }, timeoutMs);
    };

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try { socket.end(); } catch { /* already closed */ }
      if (err) reject(err); else resolve();
    };

    const tlsOpts =
      kind === "tls"
        ? {
            host,
            port,
            ...(process.env.SYSLOG_CA_BUNDLE
              ? { ca: readFileSync(process.env.SYSLOG_CA_BUNDLE) }
              : {}),
            rejectUnauthorized:
              process.env.SYSLOG_TLS_REJECT_UNAUTHORIZED !== "false",
          }
        : null;

    const socket =
      kind === "tls"
        ? tlsConnect(tlsOpts!)
        : netConnect({ host, port });

    socket.once("error", (err) => finish(err));
    socket.once(kind === "tls" ? "secureConnect" : "connect", () => {
      armTimer();
      // RFC 6587 octet-counting framing: "<length> <message>"
      // Works for both plain TCP and TLS rsyslog.
      let pending = payloads.length;
      if (pending === 0) {
        finish();
        return;
      }
      for (const p of payloads) {
        const buf = Buffer.from(p, "utf8");
        const framed = `${buf.length} `;
        socket.write(framed, "utf8");
        socket.write(buf, (err) => {
          if (err) {
            finish(err);
            return;
          }
          if (--pending === 0) finish();
        });
      }
    });
  });
}

// ── Public send helpers ──────────────────────────────────────────────────────

/**
 * Forward a single audit entry. Returns true on success, false on any
 * failure. Never throws.
 */
export async function forwardAuditEntry(
  entry: AuditEntryForSyslog
): Promise<boolean> {
  return forwardAuditBatch([entry]);
}

/**
 * Forward many entries in one connection (when stream-based). Returns true
 * iff every entry was sent successfully. Never throws.
 */
export async function forwardAuditBatch(
  entries: AuditEntryForSyslog[]
): Promise<boolean> {
  if (!isSyslogConfigured()) return false;
  if (entries.length === 0) return true;

  const host = process.env.SYSLOG_HOST!;
  const port = getPort();
  const transport = parseTransport();
  const timeoutMs = getTimeoutMs();

  const payloads = entries.map(formatRfc5424);

  try {
    if (transport === "udp") {
      await sendUdp(host, port, payloads, timeoutMs);
    } else {
      await sendStream(transport, host, port, payloads, timeoutMs);
    }
    return true;
  } catch (err) {
    // Operators see this in the application logs; the AuditLog row in the
    // DB is the source of truth and the catch-up script will retry.
    console.warn(
      `[syslog] forward failed (${transport} ${host}:${port}):`,
      (err as Error).message
    );
    return false;
  }
}
