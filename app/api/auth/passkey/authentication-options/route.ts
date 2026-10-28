/**
 * POST /api/auth/passkey/authentication-options
 *
 * Login-time equivalent of registration-options: the session has
 * needs2FA=true (password passed, second-factor pending). Generates
 * WebAuthn authentication options scoped to the user's registered passkeys.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildAuthenticationOptions, setChallengeCookie } from "@/lib/two-factor/webauthn";
import { consumeRateLimit } from "@/lib/rate-limit";
import { clientIp, tooManyAttempts } from "@/lib/request-limits";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.needs2FA) {
    return NextResponse.json({ error: "No pending 2FA challenge." }, { status: 400 });
  }

  const ip = clientIp(req.headers) ?? "unknown";
  const rl = consumeRateLimit(`passkey-auth-options:${session.user.id}:${ip}`, 10, 15 * 60 * 1000);
  if (!rl.allowed) {
    return tooManyAttempts(rl.retryAfterMs);
  }

  const existingPasskeys = await prisma.passkey.findMany({
    where: { userId: session.user.id },
    select: { credentialId: true, transports: true },
  });
  if (existingPasskeys.length === 0) {
    return NextResponse.json({ error: "No passkeys registered." }, { status: 400 });
  }

  const options = await buildAuthenticationOptions(existingPasskeys);

  const response = NextResponse.json({ options });
  await setChallengeCookie(response, session.user.id, "authentication", options.challenge);
  return response;
}
