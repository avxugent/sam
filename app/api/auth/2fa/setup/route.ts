/**
 * POST /api/auth/2fa/setup
 *
 * Generates a fresh TOTP secret for the currently logged-in credentials user
 * and returns a QR code data URL + the plain base32 secret (for manual entry).
 * The secret is saved as a *pending* setup (totpEnabled remains false) until
 * the user verifies the first code via /api/auth/2fa/enable.
 *
 * Only available to local (credentials) accounts. SSO users are rejected.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { signInIncompleteResponse } from "@/lib/two-factor/sign-in-steps";
import { prisma } from "@/lib/prisma";
import { generateTotpSecret, generateQrCodeDataUrl } from "@/lib/two-factor/totp";
import { notFoundResponse } from "@/lib/route-helpers";

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const incomplete = await signInIncompleteResponse(session, ["2fa-setup"]);
  if (incomplete) return incomplete;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { provider: true, email: true, totpEnabled: true },
  });
  if (!user) return notFoundResponse("User");
  if (user.provider !== "credentials") {
    return NextResponse.json(
      { error: "2FA is only available for local accounts." },
      { status: 400 }
    );
  }

  const { base32, otpauthUrl } = generateTotpSecret(user.email ?? session.user.email ?? "");
  const qrCodeDataUrl = await generateQrCodeDataUrl(otpauthUrl);

  // Persist the new (unverified) secret
  await prisma.user.update({
    where: { id: session.user.id },
    data: { totpSecret: base32, totpEnabled: false },
  });

  return NextResponse.json({ qrCodeDataUrl, secret: base32 });
}
