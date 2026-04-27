import { prisma } from "@/lib/prisma";
import type { Session } from "next-auth";

type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "IMPORT" | "EXPORT";

export async function logAudit({
  session,
  req,
  action,
  entityType,
  entityId,
  entityName,
  detail,
}: {
  session: Session | null;
  req?: Request;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  entityName?: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    const ip = req
      ? (req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
         req.headers.get("x-real-ip") ??
         null)
      : null;
    const userAgent = req ? req.headers.get("user-agent") ?? null : null;

    await prisma.auditLog.create({
      data: {
        userId: session?.user?.id ?? null,
        userEmail: session?.user?.email ?? null,
        action,
        entityType,
        entityId: entityId ?? null,
        entityName: entityName ?? null,
        detail: detail ? JSON.stringify(detail) : null,
        ipAddress: ip,
        userAgent,
      },
    });
  } catch {
    // Audit logging must never block or crash the main operation
  }
}
