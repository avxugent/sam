/**
 * POST /api/auth/2fa/enable
 *
 * Verifies the first TOTP code entered by the user after scanning the QR code.
 * On success, sets totpEnabled = true — from this point 2FA is enforced at login.
 *
 * Body: { code: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { authIncludingPendingSteps } from "@/lib/auth";
import { signInIncompleteResponse, sessionMismatchResponse } from "@/lib/two-factor/sign-in-steps";
import { upgradeSession } from "@/lib/two-factor/session-upgrade";
import { prisma } from "@/lib/prisma";
import { verifyTotpCode } from "@/lib/two-factor/totp";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { invalidInput, readJsonBody } from "@/lib/route-helpers";

const schema = z.object({ code: z.string().min(6).max(6) });

export async function POST(req: NextRequest) {
  const session = await authIncludingPendingSteps();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const incomplete = await signInIncompleteResponse(session, ["2fa-setup"]);
  if (incomplete) return incomplete;

  const body = await readJsonBody(req);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return invalidInput(parsed.error, "Invalid code.");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { provider: true, totpSecret: true, totpEnabled: true },
  });
  if (!user || user.provider !== "credentials") {
    return NextResponse.json({ error: "Not applicable." }, { status: 400 });
  }
  if (!user.totpSecret) {
    return NextResponse.json(
      { error: "Run setup first — no pending secret found." },
      { status: 400 }
    );
  }
  if (user.totpEnabled) {
    return NextResponse.json(
      { error: "2FA is already enabled. Disable it first to reconfigure." },
      { status: 400 }
    );
  }

  const valid = verifyTotpCode(user.totpSecret, parsed.data.code);
  if (!valid) {
    return NextResponse.json(
      { error: "Invalid code. Check your authenticator app and try again." },
      { status: 400 }
    );
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { totpEnabled: true },
  });

  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "User",
    entityId: session.user.id,
    entityName: session.user.email,
    detail: { event: "2FA enabled" },
  });

  // When this is a forced-setup session (needs2FASetup=true in JWT), re-issue a
  // clean session so the proxy no longer redirects to /login/setup-2fa.
  // Mirrors what /api/auth/2fa/verify does for the needs2FA flag.
  if (session.needs2FASetup && !(await upgradeSession(session.user.id, "totp"))) {
    return sessionMismatchResponse();
  }

  return NextResponse.json({ ok: true, message: "2FA has been enabled." });
}
