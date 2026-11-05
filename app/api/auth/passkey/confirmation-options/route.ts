/**
 * POST /api/auth/passkey/confirmation-options
 *
 * WebAuthn options for confirming a sensitive change while fully signed in
 * (removing a passkey): the assertion goes in the body of that request and
 * is checked against the "confirmation" challenge cookie set here.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildAuthenticationOptions, setChallengeCookie } from "@/lib/two-factor/webauthn";
import { consumeRateLimit } from "@/lib/rate-limit";
import { clientIp, tooManyAttemptsResponse } from "@/lib/rate-limit/http";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = clientIp(req.headers) ?? "unknown";
  const rl = consumeRateLimit(`passkey-confirm-options:${session.user.id}:${ip}`, 10, 15 * 60 * 1000);
  if (!rl.allowed) return tooManyAttemptsResponse(rl.retryAfterMs);

  const passkeys = await prisma.passkey.findMany({
    where: { userId: session.user.id },
    select: { credentialId: true, transports: true },
  });
  if (passkeys.length === 0) {
    return NextResponse.json({ error: "No passkeys registered." }, { status: 400 });
  }

  const options = await buildAuthenticationOptions(passkeys);
  const response = NextResponse.json({ options });
  await setChallengeCookie(response, session.user.id, "confirmation", options.challenge);
  return response;
}
