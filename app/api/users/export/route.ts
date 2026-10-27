/**
 * GET /api/users/export
 *
 * Access-review CSV of all user accounts (name, email, role, provider,
 * 2FA status, last login). ADMIN + session only — this is PII, so no
 * token-based access like the asset exports.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateUsersCsv } from "@/lib/csv/export";
import { logAudit } from "@/lib/audit";
import { isAdmin } from "@/lib/permissions";
import { toIsoDay } from "@/lib/utils";
import { csvDownload } from "@/lib/route-helpers";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const users = await prisma.user.findMany({
    select: {
      name: true,
      email: true,
      role: true,
      provider: true,
      totpEnabled: true,
      twoFactorRequired: true,
      lastLoginAt: true,
    },
    orderBy: { name: "asc" },
  });

  const csv = generateUsersCsv(users);

  await logAudit({
    session,
    req,
    action: "EXPORT",
    entityType: "User",
    entityName: "Access review export",
    detail: { count: users.length },
  });

  const date = toIsoDay(new Date());
  return csvDownload(csv, `sam-users-${date}.csv`);
}
