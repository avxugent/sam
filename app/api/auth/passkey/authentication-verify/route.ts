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
import { authIncludingPendingSteps } from "@/lib/auth";
import { upgradeSession } from "@/lib/two-factor/session-upgrade";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { clientIp, tooManyAttemptsResponse } from "@/lib/rate-limit/http";
import { auditLoginFailure } from "@/lib/audit/login";
import { setRememberMeCookie } from "@/lib/two-factor/remember-device";
import { verifyAuthentication, readChallengeCookie, clearChallengeCookie } from "@/lib/two-factor/webauthn";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { z } from "zod";
import { invalidInput, readJsonBody } from "@/lib/route-helpers";

const schema = z.object({
  response: z.record(z.string(), z.unknown()),
  rememberMe: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  const session = await authIncludingPendingSteps();

  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.needs2FA) {
    // Already fully authenticated — nothing to do
    return NextResponse.json({ ok: true });
  }

  const ip = clientIp(req.headers) ?? "unknown";
  const rl = consumeRateLimit(`passkey-auth-verify:${session.user.id}:${ip}`, 10, 15 * 60 * 1000);
  if (!rl.allowed) {
    auditLoginFailure({ req, actor: session.user, entityId: session.user.id, entityName: session.user.email, detail: { stage: "passkey", reason: "rate_limited" } });
    return tooManyAttemptsResponse(rl.retryAfterMs);
  }

  const body = await readJsonBody(req);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return invalidInput(parsed.error);

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
    auditLoginFailure({ req, actor: session.user, entityId: session.user.id, entityName: session.user.email, detail: { stage: "passkey", reason: "unknown_credential" } });
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
    auditLoginFailure({ req, actor: session.user, entityId: session.user.id, entityName: session.user.email, detail: { stage: "passkey", reason: "invalid_signature" } });
    return response;
  }

  await prisma.passkey.update({
    where: { id: passkey.id },
    data: { counter: newCounter, lastUsedAt: new Date() },
  });

  if (!(await upgradeSession(session.user.id, "passkey"))) {
    return NextResponse.json({ error: "Session state mismatch. Please log in again." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  clearChallengeCookie(response);
  if (parsed.data.rememberMe) {
    await setRememberMeCookie(response, session.user.id);
  }
  return response;
}
