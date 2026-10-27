/**
 * POST /api/auth/2fa/disable
 *
 * Disables 2FA for a user. Two use cases:
 *   1. Self-service: user is logged in (2FA already passed) and disables their own 2FA.
 *      Requires the current TOTP code as confirmation.
 *   2. Admin override: an Admin disables 2FA for another user (e.g. lost device).
 *      No TOTP code required.
 *
 * Body: { userId?: string, code?: string }
 *   - userId: target user (omit or pass own id for self-service)
 *   - code:   current TOTP code (required for self-service, ignored for admin override)
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyTotpCode } from "@/lib/totp";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { isAdmin } from "@/lib/permissions";

const schema = z.object({
  userId: z.string().optional(),
  code: z.string().length(6).optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });

  const targetId = parsed.data.userId ?? session.user.id;
  const isSelf = targetId === session.user.id;

  // Only admins can disable 2FA for other users
  if (!isSelf && !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id: targetId },
    select: { provider: true, totpEnabled: true, totpSecret: true, email: true },
  });
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });
  if (user.provider !== "credentials") {
    return NextResponse.json({ error: "Not applicable to SSO accounts." }, { status: 400 });
  }
  if (!user.totpEnabled) {
    return NextResponse.json({ error: "2FA is not currently enabled." }, { status: 400 });
  }

  // Self-service: require TOTP confirmation
  if (isSelf) {
    if (!parsed.data.code) {
      return NextResponse.json(
        { error: "Current 2FA code is required to disable 2FA." },
        { status: 400 }
      );
    }
    if (!user.totpSecret || !verifyTotpCode(user.totpSecret, parsed.data.code)) {
      return NextResponse.json({ error: "Invalid code." }, { status: 400 });
    }
  }

  await prisma.user.update({
    where: { id: targetId },
    data: { totpEnabled: false, totpSecret: null },
  });

  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "User",
    entityId: targetId,
    entityName: user.email ?? undefined,
    detail: {
      event: "2FA disabled",
      ...(isSelf ? {} : { adminOverride: true }),
    },
  });

  return NextResponse.json({ ok: true, message: "2FA has been disabled." });
}
