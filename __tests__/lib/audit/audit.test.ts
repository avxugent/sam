import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  prisma: {
    auditLog: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/audit/syslog", () => ({
  __esModule: true,
  isSyslogConfigured: vi.fn(),
  forwardAuditEntry: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { isSyslogConfigured, forwardAuditEntry } from "@/lib/audit/syslog";
import { logAudit } from "@/lib/audit";

const mockCreate = vi.mocked(prisma.auditLog.create);
const mockFindUnique = vi.mocked(prisma.auditLog.findUnique);
const mockUpdate = vi.mocked(prisma.auditLog.update);
const mockConfigured = vi.mocked(isSyslogConfigured);
const mockForward = vi.mocked(forwardAuditEntry);

const SESSION = { user: { id: "u1", email: "a@b.com", role: "ADMIN" } } as never;

function flush() {
  return new Promise((r) => setImmediate(r));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockResolvedValue({ id: "log1" } as never);
  mockConfigured.mockReturnValue(false);
});

describe("logAudit()", () => {
  it("persists a row with action/entityType/entityName/detail", async () => {
    await logAudit({ session: SESSION, action: "CREATE", entityType: "Asset", entityId: "a1", entityName: "Mon", detail: { x: 1 } });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u1",
          userEmail: "a@b.com",
          action: "CREATE",
          entityType: "Asset",
          entityId: "a1",
          entityName: "Mon",
          detail: JSON.stringify({ x: 1 }),
        }),
      })
    );
  });

  it("extracts IP from x-forwarded-for (first hop) and user-agent", async () => {
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2", "user-agent": "UA/1" },
    });
    await logAudit({ session: SESSION, req, action: "UPDATE", entityType: "User" });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ipAddress: "1.1.1.1", userAgent: "UA/1" }) })
    );
  });

  it("falls back to x-real-ip when x-forwarded-for absent", async () => {
    const req = new Request("http://x", { headers: { "x-real-ip": "9.9.9.9" } });
    await logAudit({ session: SESSION, req, action: "UPDATE", entityType: "User" });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ipAddress: "9.9.9.9" }) })
    );
  });

  it("handles a null session (system action) and null detail", async () => {
    await logAudit({ session: null, action: "CREATE", entityType: "User", entityName: "boot" });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: null, userEmail: null, detail: null }) })
    );
  });

  it("passes lineageId through to the created row when given", async () => {
    await logAudit({ session: SESSION, action: "UPDATE", entityType: "Asset", entityId: "a1", lineageId: "lin-1" });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lineageId: "lin-1" }) })
    );
  });

  it("omits lineageId (null) when not given", async () => {
    await logAudit({ session: SESSION, action: "UPDATE", entityType: "Location", entityId: "l1" });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lineageId: null }) })
    );
  });

  it("never throws when the DB write fails, but logs a warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockCreate.mockRejectedValue(new Error("db down"));
    await expect(
      logAudit({ session: SESSION, action: "DELETE", entityType: "Asset" })
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("[audit] failed to write audit entry:", "db down");
    warn.mockRestore();
  });

  it("does not forward to syslog when not configured", async () => {
    mockConfigured.mockReturnValue(false);
    await logAudit({ session: SESSION, action: "CREATE", entityType: "Asset" });
    await flush();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("forwards and marks forwardedAt when syslog accepts the entry", async () => {
    mockConfigured.mockReturnValue(true);
    mockFindUnique.mockResolvedValue({ id: "log1", timestamp: new Date(), userId: "u1", userEmail: "a@b.com", action: "CREATE", entityType: "Asset", entityId: null, entityName: null, detail: null, ipAddress: null, userAgent: null } as never);
    mockForward.mockResolvedValue(true as never);

    await logAudit({ session: SESSION, action: "CREATE", entityType: "Asset" });
    await flush();

    expect(mockForward).toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "log1" }, data: expect.objectContaining({ forwardedAt: expect.any(Date) }) })
    );
  });

  it("does not mark forwardedAt when syslog forwarding fails", async () => {
    mockConfigured.mockReturnValue(true);
    mockFindUnique.mockResolvedValue({ id: "log1", timestamp: new Date() } as never);
    mockForward.mockResolvedValue(false as never);

    await logAudit({ session: SESSION, action: "CREATE", entityType: "Asset" });
    await flush();

    expect(mockForward).toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("swallows errors thrown during forwarding, but logs a warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockConfigured.mockReturnValue(true);
    mockFindUnique.mockRejectedValue(new Error("boom"));
    await logAudit({ session: SESSION, action: "CREATE", entityType: "Asset" });
    await flush();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith("[audit] failed to forward audit entry to syslog:", "boom");
    warn.mockRestore();
  });

  it("uses actor attribution when no session is present", async () => {
    await logAudit({
      session: null,
      actor: { id: "u9", email: "actor@b.com" },
      action: "LOGIN_SUCCESS",
      entityType: "Auth",
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u9",
          userEmail: "actor@b.com",
          action: "LOGIN_SUCCESS",
        }),
      })
    );
  });

  it("session attribution wins over actor when both are present", async () => {
    await logAudit({
      session: SESSION,
      actor: { id: "u9", email: "actor@b.com" },
      action: "LOGOUT",
      entityType: "Auth",
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "u1", userEmail: "a@b.com", action: "LOGOUT" }),
      })
    );
  });

  it("accepts the auth event actions (LOGIN_FAILED)", async () => {
    await logAudit({
      session: null,
      action: "LOGIN_FAILED",
      entityType: "Auth",
      entityName: "x@y.z",
      detail: { reason: "invalid_password" },
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: null,
          action: "LOGIN_FAILED",
          detail: JSON.stringify({ reason: "invalid_password" }),
        }),
      })
    );
  });
});
