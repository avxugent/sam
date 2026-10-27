import { logAudit } from "@/lib/audit";

/**
 * Fire-and-forget LOGIN_FAILED entry. `actor` attributes the attempt to a user
 * who already passed the first factor; omit it for anonymous attempts.
 */
export function auditLoginFailure({
  req,
  detail,
  entityId,
  entityName,
  actor,
}: {
  req: Request;
  detail: Record<string, unknown>;
  entityId?: string;
  entityName?: string | null;
  actor?: { id: string; email?: string | null };
}): void {
  void logAudit({
    session: null,
    actor,
    req,
    action: "LOGIN_FAILED",
    entityType: "Auth",
    entityId,
    entityName: entityName ?? undefined,
    detail,
  });
}
