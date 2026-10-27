/**
 * GET /api/auth/passkey/list
 *
 * Returns the current user's registered passkeys for the self-service
 * settings UI. Never returns credentialId/publicKey/counter.
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

  const passkeys = await prisma.passkey.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      label: true,
      deviceType: true,
      backedUp: true,
      createdAt: true,
      lastUsedAt: true,
    },
  });

  return NextResponse.json({ passkeys });
}
