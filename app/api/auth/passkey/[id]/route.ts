/**
 * DELETE /api/auth/passkey/[id]
 *
 * Removes one of the current user's registered passkeys. Passkeys are
 * always self-managed — there is no admin-override case (unlike
 * /api/auth/2fa/disable).
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const passkey = await prisma.passkey.findUnique({ where: { id } });

  // 404 (not 403) for another user's passkey — don't confirm it exists.
  if (!passkey || passkey.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.passkey.delete({ where: { id } });

  await logAudit({
    session,
    req,
    action: "DELETE",
    entityType: "User",
    entityId: session.user.id,
    entityName: session.user.email ?? undefined,
    detail: { event: "Passkey removed", label: passkey.label },
  });

  return NextResponse.json({ ok: true });
}
