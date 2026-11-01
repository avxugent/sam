import { Role } from "@/generated/prisma/enums";

export { Role };

/**
 * Role predicates — the single source of truth for who may do what.
 * Pure functions with no server imports, so client components can use them too.
 *
 * ADMIN       — everything, including users, settings, imports/exports and audit
 * MAINTAINER  — inventory writes plus the catalog (manufacturers, models, suppliers, …)
 * EDITOR      — inventory writes (locations, assets, stock, work logs, reports)
 * VIEWER      — read-only
 */

type MaybeRole = Role | null | undefined;

export function isAdmin(role: MaybeRole): boolean {
  return role === Role.ADMIN;
}

export function canManageCatalog(role: MaybeRole): boolean {
  return role === Role.ADMIN || role === Role.MAINTAINER;
}

export function canEdit(role: MaybeRole): boolean {
  return role === Role.ADMIN || role === Role.MAINTAINER || role === Role.EDITOR;
}

/**
 * Edit or delete a work-log entry: writers only, and among them the entry's
 * performer or an admin. The one record-level (ownership) rule in the app.
 */
export function canModifyWorkLog(role: MaybeRole, userId: string | null | undefined, performedById: string): boolean {
  return canEdit(role) && (isAdmin(role) || performedById === userId);
}
