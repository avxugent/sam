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
import { verifyTotpCode } from "@/lib/two-factor/totp";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp, tooManyAttempts } from "@/lib/request-limits";
import { auditLoginFailure } from "@/lib/login-audit";
import { setRememberMeCookie } from "@/lib/two-factor/remember-device";
import { z } from "zod";
import { invalidInput, readJsonBody } from "@/lib/route-helpers";

const schema = z.object({
  code: z.string().min(6).max(6),
  rememberMe: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  const session = await auth();

  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.needs2FA) {
    // Already fully authenticated — nothing to do
    return NextResponse.json({ ok: true });
  }

  // Rate-limit TOTP verification per user + IP to prevent brute-force of 6-digit codes
  const ip = clientIp(req.headers) ?? "unknown";
  const rl = checkRateLimit(`2fa:${session.user.id}:${ip}`, 10, 15 * 60 * 1000);
  if (!rl.allowed) {
    auditLoginFailure({ req, actor: session.user, entityId: session.user.id, entityName: session.user.email, detail: { stage: "totp", reason: "rate_limited" } });
    return tooManyAttempts(rl.retryAfterMs);
  }

  const body = await readJsonBody(req);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return invalidInput(parsed.error, "Invalid code.");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { totpSecret: true, totpEnabled: true },
  });

  if (!user?.totpEnabled || !user.totpSecret) {
    // 2FA was disabled between login and this call — the session state is
    // inconsistent. Require the user to log in again rather than silently granting access.
    return NextResponse.json(
      { error: "Session state mismatch. Please log in again." },
      { status: 401 }
    );
  }

  const valid = verifyTotpCode(user.totpSecret, parsed.data.code);
  if (!valid) {
    auditLoginFailure({ req, actor: session.user, entityId: session.user.id, entityName: session.user.email, detail: { stage: "totp", reason: "invalid_code" } });
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
      method: "totp",
      redirect: false,
    });
  } catch {
    // NextAuth may throw a NEXT_REDIRECT — that is expected and fine.
    // The Set-Cookie header is set as a side effect regardless.
  }

  const response = NextResponse.json({ ok: true });

  if (parsed.data.rememberMe) {
    await setRememberMeCookie(response, session.user.id);
  }

  return response;
}
