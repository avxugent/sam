/**
 * POST /api/auth/passkey/registration-verify
 *
 * Verifies a WebAuthn registration response against the challenge cookie set
 * by /api/auth/passkey/registration-options, then persists the new Passkey.
 *
 * If this is a forced-2FA-setup session (needs2FASetup=true), re-issues a
 * clean session via the internal "credentials-2fa-verified" provider —
 * mirrors what /api/auth/2fa/enable does for TOTP.
 *
 * Body: { response: RegistrationResponseJSON, label?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { auth, signIn } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { verifyRegistration, readChallengeCookie, clearChallengeCookie } from "@/lib/two-factor/webauthn";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { z } from "zod";
import { invalidInput, readJsonBody } from "@/lib/route-helpers";

const schema = z.object({
  response: z.record(z.string(), z.unknown()),
  label: z.string().max(100).optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await readJsonBody(req);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return invalidInput(parsed.error);

  const challenge = await readChallengeCookie(req, session.user.id, "registration");
  if (!challenge) {
    const response = NextResponse.json(
      { error: "Registration session expired. Please try again." },
      { status: 400 }
    );
    clearChallengeCookie(response);
    return response;
  }

  const verified = await verifyRegistration(
    parsed.data.response as unknown as RegistrationResponseJSON,
    challenge
  );
  if (!verified) {
    const response = NextResponse.json(
      { error: "Could not register passkey. Please try again." },
      { status: 400 }
    );
    clearChallengeCookie(response);
    return response;
  }

  const label = parsed.data.label?.trim() || `Passkey (${new Date().toLocaleDateString()})`;

  await prisma.passkey.create({
    data: {
      userId: session.user.id,
      credentialId: verified.credentialId,
      publicKey: verified.publicKey,
      counter: verified.counter,
      transports: verified.transports,
      deviceType: verified.deviceType,
      backedUp: verified.backedUp,
      label,
    },
  });

  await logAudit({
    session,
    req,
    action: "CREATE",
    entityType: "User",
    entityId: session.user.id,
    entityName: session.user.email ?? undefined,
    detail: { event: "Passkey registered", label },
  });

  // When this is a forced-setup session, re-issue a clean session so the
  // proxy no longer redirects to /login/setup-2fa. Mirrors /api/auth/2fa/enable.
  if (session.needs2FASetup) {
    try {
      await signIn("credentials-2fa-verified", {
        userId: session.user.id,
        method: "passkey",
        redirect: false,
      });
    } catch {
      // NextAuth may throw a NEXT_REDIRECT — that is expected and fine.
    }
  }

  const response = NextResponse.json({ ok: true });
  clearChallengeCookie(response);
  return response;
}
