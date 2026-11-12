/**
 * DELETE /api/users/me/api-keys/[id] — revoke one of the current user's keys.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { notFoundResponse } from "@/lib/route-helpers";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const key = await prisma.apiKey.findUnique({ where: { id }, select: { userId: true, label: true, keyPrefix: true } });
  // 404 (not 403) for another user's key — don't confirm it exists.
  if (!key || key.userId !== session.user.id) return notFoundResponse("API key");

  await prisma.apiKey.deleteMany({ where: { id, userId: session.user.id } });

  await logAudit({
    session,
    req,
    action: "DELETE",
    entityType: "ApiKey",
    entityId: id,
    entityName: key.label,
    detail: { keyPrefix: key.keyPrefix },
  });

  return NextResponse.json({ ok: true });
}
