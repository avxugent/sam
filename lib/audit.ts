import { prisma } from "@/lib/prisma";
import type { Session } from "next-auth";
import { forwardAuditEntry, isSyslogConfigured } from "@/lib/syslog";

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
    const ip = req
      ? (req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
         req.headers.get("x-real-ip") ??
         null)
      : null;
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
      void forwardAndMark(created.id);
    }
  } catch {
    // Audit logging must never block or crash the main operation
  }
}

async function forwardAndMark(id: string): Promise<void> {
  try {
    const row = await prisma.auditLog.findUnique({ where: { id } });
    if (!row) return;
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
        where: { id },
        data: { forwardedAt: new Date() },
      });
    }
  } catch {
    // Same defensive posture as logAudit — never let a syslog problem
    // surface to the caller. The DB row is preserved for retry.
  }
}
