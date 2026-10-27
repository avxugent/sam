import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock node built-ins BEFORE importing the module under test ───────────────
// The factories are hoisted; they pull EventEmitter via require() because
// top-level imports are evaluated AFTER hoisted mocks.

vi.mock("dgram", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter } = require("events");
  class FakeUdpSocket extends EventEmitter {
    sent: { msg: Buffer; port: number; host: string }[] = [];
    closed = false;
    send(msg: Buffer, port: number, host: string, cb: (err?: Error | null) => void) {
      this.sent.push({ msg, port, host });
      // Decide success/failure via a side-channel set by the test
      const failure = (FakeUdpSocket as unknown as { __failNext?: Error }).__failNext;
      if (failure) {
        (FakeUdpSocket as unknown as { __failNext?: Error }).__failNext = undefined;
        cb(failure);
        return;
      }
      cb();
    }
    close() { this.closed = true; }
  }
  const createSocket = vi.fn(() => {
    const s = new FakeUdpSocket();
    (FakeUdpSocket as unknown as { __last: FakeUdpSocket }).__last = s;
    return s;
  });
  return {
    default: { createSocket },
    createSocket,
    __FakeUdpSocket: FakeUdpSocket,
  };
});

vi.mock("net", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter } = require("events");
  class FakeTcpSocket extends EventEmitter {
    written: Buffer[] = [];
    ended = false;
    destroyed = false;
    write(chunk: string | Buffer, _encOrCb?: BufferEncoding | ((err?: Error) => void), maybeCb?: (err?: Error) => void) {
      const cb = typeof _encOrCb === "function" ? _encOrCb : maybeCb;
      this.written.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8"));
      if (cb) cb();
      return true;
    }
    end() { this.ended = true; }
    destroy(err?: Error) { this.destroyed = true; if (err) this.emit("error", err); }
  }
  const connect = vi.fn(() => {
    const s = new FakeTcpSocket();
    (FakeTcpSocket as unknown as { __last: FakeTcpSocket }).__last = s;
    setImmediate(() => s.emit("connect"));
    return s;
  });
  return {
    default: { connect },
    connect,
    __FakeTcpSocket: FakeTcpSocket,
  };
});

vi.mock("tls", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter } = require("events");
  class FakeTlsSocket extends EventEmitter {
    written: Buffer[] = [];
    ended = false;
    destroyed = false;
    write(chunk: string | Buffer, _encOrCb?: BufferEncoding | ((err?: Error) => void), maybeCb?: (err?: Error) => void) {
      const cb = typeof _encOrCb === "function" ? _encOrCb : maybeCb;
      this.written.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8"));
      if (cb) cb();
      return true;
    }
    end() { this.ended = true; }
    destroy(err?: Error) { this.destroyed = true; if (err) this.emit("error", err); }
  }
  const connect = vi.fn(() => {
    const s = new FakeTlsSocket();
    (FakeTlsSocket as unknown as { __last: FakeTlsSocket }).__last = s;
    setImmediate(() => s.emit("secureConnect"));
    return s;
  });
  return {
    default: { connect },
    connect,
    __FakeTlsSocket: FakeTlsSocket,
  };
});

import * as dgram from "dgram";
import * as net from "net";
import * as tls from "tls";
import {
  isSyslogConfigured,
  formatRfc5424,
  forwardAuditEntry,
  forwardAuditBatch,
  type AuditEntryForSyslog,
} from "@/lib/syslog";

const FakeUdp = (dgram as unknown as { __FakeUdpSocket: { __last: { sent: { host: string; port: number; msg: Buffer }[]; closed: boolean }; __failNext?: Error } }).__FakeUdpSocket;
const FakeTcp = (net as unknown as { __FakeTcpSocket: { __last: { written: Buffer[]; ended: boolean } } }).__FakeTcpSocket;
const FakeTls = (tls as unknown as { __FakeTlsSocket: { __last: { written: Buffer[]; ended: boolean } } }).__FakeTlsSocket;

const baseEntry: AuditEntryForSyslog = {
  id: "log-1",
  timestamp: new Date("2026-05-03T10:30:00.000Z"),
  userId: "u1",
  userEmail: "alice@example.com",
  action: "CREATE",
  entityType: "Asset",
  entityId: "a1",
  entityName: "Projector",
  detail: '{"ip":"10.0.0.1"}',
  ipAddress: "10.0.0.1",
  userAgent: "curl/8",
};

beforeEach(() => {
  vi.unstubAllEnvs();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

// ── isSyslogConfigured ───────────────────────────────────────────────────────

describe("isSyslogConfigured()", () => {
  it("returns false without SYSLOG_HOST", () => {
    expect(isSyslogConfigured()).toBe(false);
  });
  it("returns true with SYSLOG_HOST set", () => {
    vi.stubEnv("SYSLOG_HOST", "logs.example.com");
    expect(isSyslogConfigured()).toBe(true);
  });
});

// ── formatRfc5424 ────────────────────────────────────────────────────────────

describe("formatRfc5424()", () => {
  it("produces the canonical RFC 5424 frame shape", () => {
    vi.stubEnv("SYSLOG_HOSTNAME", "sam-host");
    vi.stubEnv("SYSLOG_APP_NAME", "sam");
    vi.stubEnv("SYSLOG_FACILITY", "10");
    const out = formatRfc5424(baseEntry);
    // <PRI>1 <ts> <host> <app> <pid> <msgid> - <msg>
    const m = out.match(/^<(\d+)>1 (\S+) (\S+) (\S+) (\S+) (\S+) - (.+)$/);
    expect(m).not.toBeNull();
    const [, pri, ts, host, app, , msgid, msg] = m!;
    expect(Number(pri)).toBe(10 * 8 + 6);
    expect(ts).toBe("2026-05-03T10:30:00.000Z");
    expect(host).toBe("sam-host");
    expect(app).toBe("sam");
    expect(msgid).toBe("CREATE");
    // MSG starts with BOM + JSON
    expect(msg.startsWith("﻿{")).toBe(true);
    const parsed = JSON.parse(msg.slice(1));
    expect(parsed.id).toBe("log-1");
    expect(parsed.user).toBe("alice@example.com");
    expect(parsed.action).toBe("CREATE");
    expect(parsed.entity).toBe("Asset");
    expect(parsed.detail).toEqual({ ip: "10.0.0.1" });
  });

  it("escapes spaces in HOSTNAME / APP-NAME", () => {
    vi.stubEnv("SYSLOG_HOSTNAME", "sam host");
    vi.stubEnv("SYSLOG_APP_NAME", "sam app");
    const out = formatRfc5424(baseEntry);
    const m = out.match(/^<\d+>1 \S+ (\S+) (\S+) /)!;
    expect(m[1]).toBe("sam_host");
    expect(m[2]).toBe("sam_app");
  });

  it("falls back to userId when userEmail is missing", () => {
    const entry = { ...baseEntry, userEmail: null };
    const out = formatRfc5424(entry);
    const json = JSON.parse(out.split(" - ")[1].slice(1));
    expect(json.user).toBe("u1");
  });

  it("preserves non-JSON detail strings as-is", () => {
    const entry = { ...baseEntry, detail: "free-text not json" };
    const out = formatRfc5424(entry);
    const json = JSON.parse(out.split(" - ")[1].slice(1));
    expect(json.detail).toBe("free-text not json");
  });

  it("uses default facility 10 for invalid SYSLOG_FACILITY", () => {
    vi.stubEnv("SYSLOG_FACILITY", "99");
    const out = formatRfc5424(baseEntry);
    expect(out.startsWith(`<${10 * 8 + 6}>`)).toBe(true);
  });

  it("honours a valid custom SYSLOG_FACILITY", () => {
    vi.stubEnv("SYSLOG_FACILITY", "1");
    const out = formatRfc5424(baseEntry);
    expect(out.startsWith(`<${1 * 8 + 6}>`)).toBe(true);
  });

  it("ignores a non-numeric SYSLOG_FACILITY", () => {
    vi.stubEnv("SYSLOG_FACILITY", "abc");
    const out = formatRfc5424(baseEntry);
    expect(out.startsWith(`<${10 * 8 + 6}>`)).toBe(true);
  });

  it("emits '-' for the user field when both userEmail and userId are null", () => {
    const out = formatRfc5424({ ...baseEntry, userEmail: null, userId: null });
    const json = JSON.parse(out.split(" - ")[1].slice(1));
    expect(json.user).toBeNull();
  });

  it("emits null detail when entry.detail is null", () => {
    const out = formatRfc5424({ ...baseEntry, detail: null });
    const json = JSON.parse(out.split(" - ")[1].slice(1));
    expect(json.detail).toBeNull();
  });

  it("uses custom SYSLOG_HOSTNAME and SYSLOG_APP_NAME", () => {
    vi.stubEnv("SYSLOG_HOSTNAME", "myhost");
    vi.stubEnv("SYSLOG_APP_NAME", "myapp");
    const out = formatRfc5424(baseEntry);
    expect(out).toContain("myhost");
    expect(out).toContain("myapp");
  });
});

// ── forwardAuditEntry / forwardAuditBatch ────────────────────────────────────

describe("forwardAuditEntry() — UDP transport", () => {
  beforeEach(() => {
    vi.stubEnv("SYSLOG_HOST", "logs.example.com");
    vi.stubEnv("SYSLOG_TRANSPORT", "udp");
    vi.stubEnv("SYSLOG_PORT", "1514");
    (FakeUdp as { __failNext?: Error }).__failNext = undefined;
  });

  it("returns false when not configured", async () => {
    vi.stubEnv("SYSLOG_HOST", "");
    expect(await forwardAuditEntry(baseEntry)).toBe(false);
  });

  it("sends one UDP datagram per entry and closes the socket", async () => {
    const ok = await forwardAuditEntry(baseEntry);
    expect(ok).toBe(true);
    const sock = FakeUdp.__last;
    expect(sock.sent).toHaveLength(1);
    expect(sock.sent[0].host).toBe("logs.example.com");
    expect(sock.sent[0].port).toBe(1514);
    expect(sock.closed).toBe(true);
  });

  it("falls back to the default port for an out-of-range SYSLOG_PORT", async () => {
    vi.stubEnv("SYSLOG_PORT", "99999");
    await forwardAuditEntry(baseEntry);
    expect(FakeUdp.__last.sent[0].port).toBe(514);
  });

  it("falls back to the default port for a non-numeric SYSLOG_PORT", async () => {
    vi.stubEnv("SYSLOG_PORT", "abc");
    await forwardAuditEntry(baseEntry);
    expect(FakeUdp.__last.sent[0].port).toBe(514);
  });

  it("defaults to UDP transport for an unknown SYSLOG_TRANSPORT", async () => {
    vi.stubEnv("SYSLOG_TRANSPORT", "carrier-pigeon");
    const ok = await forwardAuditEntry(baseEntry);
    expect(ok).toBe(true);
    expect(FakeUdp.__last.sent).toHaveLength(1);
  });

  it("returns false on UDP send error", async () => {
    (FakeUdp as { __failNext?: Error }).__failNext = new Error("ENETUNREACH");
    const ok = await forwardAuditEntry(baseEntry);
    expect(ok).toBe(false);
  });

  it("forwardAuditBatch sends one datagram per entry", async () => {
    const ok = await forwardAuditBatch([
      baseEntry,
      { ...baseEntry, id: "log-2", action: "UPDATE" },
      { ...baseEntry, id: "log-3", action: "DELETE" },
    ]);
    expect(ok).toBe(true);
    expect(FakeUdp.__last.sent).toHaveLength(3);
  });

  it("empty batch resolves true without opening a socket call", async () => {
    const ok = await forwardAuditBatch([]);
    expect(ok).toBe(true);
  });
});

describe("forwardAuditBatch() — TCP transport with octet-counting framing", () => {
  beforeEach(() => {
    vi.stubEnv("SYSLOG_HOST", "logs.example.com");
    vi.stubEnv("SYSLOG_TRANSPORT", "tcp");
  });

  it("connects, frames each message with `<length> ` prefix, and ends", async () => {
    const ok = await forwardAuditBatch([baseEntry, { ...baseEntry, id: "log-2" }]);
    expect(ok).toBe(true);
    const sock = FakeTcp.__last;
    // Each message contributes 2 writes: framing prefix + body
    expect(sock.written.length).toBe(4);
    // Even-indexed writes are framing prefixes ending in a single space
    expect(sock.written[0].toString()).toMatch(/^\d+ $/);
    expect(sock.written[2].toString()).toMatch(/^\d+ $/);
    expect(sock.ended).toBe(true);
  });

  it("gives up after SYSLOG_TIMEOUT_MS when the host never accepts the connection", async () => {
    vi.stubEnv("SYSLOG_TIMEOUT_MS", "20");
    const Ctor = FakeTcp as unknown as new () => { destroyed: boolean };
    let sock: { destroyed: boolean } | undefined;
    vi.mocked(net.connect).mockImplementationOnce((() => (sock = new Ctor())) as never);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await forwardAuditEntry(baseEntry)).toBe(false);
    expect(sock?.destroyed).toBe(true);
  });
});

describe("forwardAuditBatch() — TLS transport", () => {
  beforeEach(() => {
    vi.stubEnv("SYSLOG_HOST", "logs.example.com");
    vi.stubEnv("SYSLOG_TRANSPORT", "tls");
  });

  it("uses the TLS connect path", async () => {
    const ok = await forwardAuditBatch([baseEntry]);
    expect(ok).toBe(true);
    const sock = FakeTls.__last;
    expect(sock.written.length).toBe(2);
    expect(sock.ended).toBe(true);
  });
});
