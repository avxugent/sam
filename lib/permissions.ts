import { auth } from "@/lib/auth";

export type UserRole = "ADMIN" | "MAINTAINER" | "EDITOR" | "VIEWER";

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function requireRole(...roles: UserRole[]) {
  const session = await requireAuth();
  const userRole = session.user.role as UserRole;
  if (!roles.includes(userRole)) {
    throw new Error("Forbidden");
  }
  return session;
}

export function canEdit(role: string) {
  return role === "ADMIN" || role === "EDITOR" || role === "MAINTAINER";
}

export function isAdmin(role: string) {
  return role === "ADMIN";
}
