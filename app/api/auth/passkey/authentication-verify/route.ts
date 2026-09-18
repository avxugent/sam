/**
 * POST /api/auth/passkey/authentication-verify
 *
 * Passkey analogue of /api/auth/2fa/verify. The session has needs2FA=true
 * (password passed, second-factor pending). Verifies the WebAuthn assertion
 * against the challenge cookie and the stored passkey. On success, re-issues
 * the session via the internal "credentials-2fa-verified" provider, exactly
 * like the TOTP verify route.
 *
 * Body: { response: AuthenticationResponseJSON, rememberMe?: boolean }
 */
import { NextRequest, NextResponse } from "next/server";
import { auth, signIn } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { setRememberMeCookie } from "@/lib/remember-device";
import { verifyAuthentication, readChallengeCookie, clearChallengeCookie } from "@/lib/webauthn";
import type { AuthenticationResponseJSON } from "@simplewebauthn/types";
import { z } from "zod";

const schema = z.object({
  response: z.record(z.string(), z.unknown()),
  rememberMe: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  const session = await auth();

  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(session as { needs2FA?: boolean }).needs2FA) {
    // Already fully authenticated — nothing to do
    return NextResponse.json({ ok: true });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const rl = checkRateLimit(`passkey-auth-verify:${session.user.id}:${ip}`, 10, 15 * 60 * 1000);
  if (!rl.allowed) {
    void logAudit({
      session: null,
      actor: { id: session.user.id, email: session.user.email },
      req,
      action: "LOGIN_FAILED",
      entityType: "Auth",
      entityId: session.user.id,
      entityName: session.user.email ?? undefined,
      detail: { stage: "passkey", reason: "rate_limited" },
    });
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const challenge = await readChallengeCookie(req, session.user.id, "authentication");
  if (!challenge) {
    const response = NextResponse.json(
      { error: "Passkey session expired. Please try again." },
      { status: 400 }
    );
    clearChallengeCookie(response);
    return response;
  }

  const credentialId = (parsed.data.response as { id?: unknown }).id;
  const passkey =
    typeof credentialId === "string"
      ? await prisma.passkey.findUnique({ where: { credentialId } })
      : null;

  if (!passkey || passkey.userId !== session.user.id) {
    const response = NextResponse.json({ error: "Passkey not recognized." }, { status: 400 });
    clearChallengeCookie(response);
    void logAudit({
      session: null,
      actor: { id: session.user.id, email: session.user.email },
      req,
      action: "LOGIN_FAILED",
      entityType: "Auth",
      entityId: session.user.id,
      entityName: session.user.email ?? undefined,
      detail: { stage: "passkey", reason: "unknown_credential" },
    });
    return response;
  }

  const { verified, newCounter } = await verifyAuthentication(
    parsed.data.response as unknown as AuthenticationResponseJSON,
    challenge,
    passkey
  );

  if (!verified) {
    const response = NextResponse.json(
      { error: "Passkey verification failed." },
      { status: 400 }
    );
    clearChallengeCookie(response);
    void logAudit({
      session: null,
      actor: { id: session.user.id, email: session.user.email },
      req,
      action: "LOGIN_FAILED",
      entityType: "Auth",
      entityId: session.user.id,
      entityName: session.user.email ?? undefined,
      detail: { stage: "passkey", reason: "invalid_signature" },
    });
    return response;
  }

  await prisma.passkey.update({
    where: { id: passkey.id },
    data: { counter: newCounter, lastUsedAt: new Date() },
  });

  // Issue a clean session by signing in via the internal upgrade provider.
  try {
    await signIn("credentials-2fa-verified", {
      userId: session.user.id,
      method: "passkey",
      redirect: false,
    });
  } catch {
    // NextAuth may throw a NEXT_REDIRECT — that is expected and fine.
  }

  const response = NextResponse.json({ ok: true });
  clearChallengeCookie(response);
  if (parsed.data.rememberMe) {
    await setRememberMeCookie(response, session.user.id);
  }
  return response;
}
