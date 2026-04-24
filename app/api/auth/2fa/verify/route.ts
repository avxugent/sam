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
import { checkRateLimit } from "@/lib/rate-limit";
import { SignJWT } from "jose";
import { z } from "zod";

const schema = z.object({
  code: z.string().min(6).max(6),
  rememberMe: z.boolean().optional().default(false),
});

const REMEMBER_DAYS = 30;
const COOKIE_NAME = "sam_2fa_rm";

async function signRememberMeToken(userId: string): Promise<string> {
  const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET ?? "");
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${REMEMBER_DAYS}d`)
    .sign(secret);
}

export async function POST(req: NextRequest) {
  const session = await auth();

  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(session as { needs2FA?: boolean }).needs2FA) {
    // Already fully authenticated — nothing to do
    return NextResponse.json({ ok: true });
  }

  // Rate-limit TOTP verification per user + IP to prevent brute-force of 6-digit codes
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const rl = checkRateLimit(`2fa:${session.user.id}:${ip}`, 10, 15 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
      }
    );
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid code." }, { status: 400 });

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

  const response = NextResponse.json({ ok: true });

  if (parsed.data.rememberMe) {
    const token = await signRememberMeToken(session.user.id);
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: REMEMBER_DAYS * 24 * 60 * 60,
      secure: process.env.NODE_ENV === "production",
    });
  }

  return response;
}
