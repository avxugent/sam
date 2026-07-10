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
import { generateUsersCsv } from "@/lib/csv-export";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sam-users-${date}.csv"`,
    },
  });
}
