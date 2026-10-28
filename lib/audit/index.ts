import { prisma } from "@/lib/prisma";
import type { Session } from "next-auth";
import type { AuditLog } from "@/generated/prisma/client";
import { forwardAuditEntry, isSyslogConfigured } from "@/lib/audit/syslog";
import { clientIp } from "@/lib/rate-limit-http";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "IMPORT"
  | "EXPORT"
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "LOGOUT";

export async function logAudit({
  session,
  actor,
  req,
  action,
  entityType,
  entityId,
  entityName,
  detail,
  lineageId,
}: {
  session: Session | null;
  /** Attribution when no session exists yet (authorize()/auth events) */
  actor?: { id?: string | null; email?: string | null };
  req?: Request;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  entityName?: string;
  detail?: Record<string, unknown>;
  /** Asset/StockItem lineage grouping key — see Asset.lineageId. */
  lineageId?: string;
}): Promise<void> {
  try {
    const ip = req ? clientIp(req.headers) : null;
    const userAgent = req ? req.headers.get("user-agent") ?? null : null;

    const created = await prisma.auditLog.create({
      data: {
        userId: session?.user?.id ?? actor?.id ?? null,
        userEmail: session?.user?.email ?? actor?.email ?? null,
        action,
        entityType,
        entityId: entityId ?? null,
        entityName: entityName ?? null,
        detail: detail ? JSON.stringify(detail) : null,
        lineageId: lineageId ?? null,
        ipAddress: ip,
        userAgent,
      },
    });

    // Fire-and-forget rsyslog forwarder. If forwarding succeeds we mark the
    // row so the catch-up script (`scripts/forward-audit.mjs`) skips it; if
    // it fails the row stays "unforwarded" and the catch-up retries. We do
    // not await the chain so HTTP responses are not delayed by syslog I/O.
    if (isSyslogConfigured()) {
      void forwardAndMark(created);
    }
  } catch (err) {
    // Audit logging must never block or crash the main operation, but a broken
    // audit trail has to be visible in the logs.
    console.warn("[audit] failed to write audit entry:", err instanceof Error ? err.message : err);
  }
}

async function forwardAndMark(row: AuditLog): Promise<void> {
  try {
    const ok = await forwardAuditEntry({
      id: row.id,
      timestamp: row.timestamp,
      userId: row.userId,
      userEmail: row.userEmail,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      entityName: row.entityName,
      detail: row.detail,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
    });
    if (ok) {
      await prisma.auditLog.update({
        where: { id: row.id },
        data: { forwardedAt: new Date() },
      });
    }
  } catch (err) {
    // Same defensive posture as logAudit — never let a syslog problem
    // surface to the caller. The DB row is preserved for retry.
    console.warn("[audit] failed to forward audit entry to syslog:", err instanceof Error ? err.message : err);
  }
}
