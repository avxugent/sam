/**
 * POST /api/auth/2fa/enable
 *
 * Verifies the first TOTP code entered by the user after scanning the QR code.
 * On success, sets totpEnabled = true — from this point 2FA is enforced at login.
 *
 * Body: { code: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { auth, signIn } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyTotpCode } from "@/lib/totp";
import { z } from "zod";

const schema = z.object({ code: z.string().min(6).max(6) });

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid code." }, { status: 400 });

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

  // When this is a forced-setup session (needs2FASetup=true in JWT), re-issue a
  // clean session so the proxy no longer redirects to /login/setup-2fa.
  // Mirrors what /api/auth/2fa/verify does for the needs2FA flag.
  if ((session as { needs2FASetup?: boolean }).needs2FASetup) {
    try {
      await signIn("credentials-2fa-verified", {
        userId: session.user.id,
        redirect: false,
      });
    } catch {
      // next-auth may throw NEXT_REDIRECT internally — safe to ignore.
    }
  }

  return NextResponse.json({ ok: true, message: "2FA has been enabled." });
}
