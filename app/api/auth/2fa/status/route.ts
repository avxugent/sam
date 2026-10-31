/**
 * GET /api/auth/2fa/status
 *
 * Returns the current user's 2FA status.
 * Used by the settings page to show the current state.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFoundResponse } from "@/lib/route-helpers";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { provider: true, totpEnabled: true },
  });

  if (!user) return notFoundResponse("User");

  return NextResponse.json({
    provider: user.provider,
    totpEnabled: user.totpEnabled,
    // 2FA is only applicable to local accounts
    applicable: user.provider === "credentials",
  });
}
