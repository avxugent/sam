/**
 * POST /api/auth/passkey/registration-options
 *
 * Generates WebAuthn registration options for the current user (self-service
 * settings, or the forced-2FA-setup flow choosing a passkey instead of TOTP).
 * Sets a short-lived challenge cookie the client must round-trip via
 * /api/auth/passkey/registration-verify.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildRegistrationOptions, setChallengeCookie } from "@/lib/webauthn";

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, provider: true, email: true, name: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (user.provider !== "credentials") {
    return NextResponse.json(
      { error: "Passkeys are only available for local accounts." },
      { status: 400 }
    );
  }

  const existingPasskeys = await prisma.passkey.findMany({
    where: { userId: user.id },
    select: { credentialId: true, transports: true },
  });

  const options = await buildRegistrationOptions(
    { id: user.id, email: user.email, name: user.name },
    existingPasskeys
  );

  const response = NextResponse.json({ options });
  await setChallengeCookie(response, user.id, "registration", options.challenge);
  return response;
}
