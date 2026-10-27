/**
 * GET /api/auth/2fa/status
 *
 * Returns the current user's 2FA status.
 * Used by the settings page to show the current state.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { signInIncompleteResponse } from "@/lib/two-factor/sign-in-steps";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const incomplete = await signInIncompleteResponse(session);
  if (incomplete) return incomplete;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { provider: true, totpEnabled: true },
  });

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json({
    provider: user.provider,
    totpEnabled: user.totpEnabled,
    // 2FA is only applicable to local accounts
    applicable: user.provider === "credentials",
  });
}
