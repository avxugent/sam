/**
 * POST /api/auth/2fa/verify
 *
 * Called from the /login/2fa challenge page.
 * The session has needs2FA=true (password passed, TOTP pending).
 * Verifies the entered 6-digit code. On success, re-issues the session
 * via the internal "credentials-2fa-verified" provider, which produces
 * a clean JWT without the needs2FA flag.
 *
 * Body: { code: string }
 * Returns: { ok: true } on success; client must do router.refresh() to
 *           pick up the updated session cookie.
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
  if (!(session as { needs2FA?: boolean }).needs2FA) {
    // Already fully authenticated — nothing to do
    return NextResponse.json({ ok: true });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid code." }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { totpSecret: true, totpEnabled: true },
  });

  if (!user?.totpEnabled || !user.totpSecret) {
    // 2FA was disabled between login and this call — treat as verified
    return NextResponse.json({ ok: true });
  }

  const valid = verifyTotpCode(user.totpSecret, parsed.data.code);
  if (!valid) {
    return NextResponse.json(
      { error: "Invalid code. Check your authenticator app and try again." },
      { status: 400 }
    );
  }

  // Issue a clean session by signing in via the internal upgrade provider.
  // NextAuth v5 signIn() with redirect:false returns undefined (not a Response),
  // so we wrap it to suppress the expected redirect behaviour.
  try {
    await signIn("credentials-2fa-verified", {
      userId: session.user.id,
      redirect: false,
    });
  } catch {
    // NextAuth may throw a NEXT_REDIRECT — that is expected and fine.
    // The Set-Cookie header is set as a side effect regardless.
  }

  return NextResponse.json({ ok: true });
}
