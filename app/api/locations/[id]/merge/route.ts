import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import type { Prisma } from "@/generated/prisma/client";
import { canEdit } from "@/lib/permissions";

const mergeSchema = z.object({
  targetId: z.string().min(1),
});

/**
 * Merge the location identified by [id] (the source) into another location
 * (the target). All of the source's assets, sub-locations, attachments and
 * work logs are reassigned to the target, then the source is deleted.
 *
 * Guard rails: the two locations must be distinct siblings (same parent). This
 * is the server-side counterpart of the rename-collision flow — it never
 * creates a duplicate, it consolidates.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const parsed = mergeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { targetId } = parsed.data;

  if (targetId === id) {
    return NextResponse.json({ error: "A location cannot be merged into itself." }, { status: 400 });
  }

  const [source, target] = await Promise.all([
    prisma.location.findUnique({ where: { id }, select: { id: true, name: true, parentId: true } }),
    prisma.location.findUnique({ where: { id: targetId }, select: { id: true, name: true, parentId: true } }),
  ]);

  if (!source || !target) {
    return NextResponse.json({ error: "Location not found." }, { status: 404 });
  }
  if (source.parentId !== target.parentId) {
    return NextResponse.json(
      { error: "Only locations under the same parent can be merged." },
      { status: 400 }
    );
  }

  const [movedAssets, movedSublocations] = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const assets = await tx.asset.updateMany({ where: { locationId: id }, data: { locationId: targetId } });
    const subs = await tx.location.updateMany({ where: { parentId: id }, data: { parentId: targetId } });
    await tx.attachment.updateMany({ where: { locationId: id }, data: { locationId: targetId } });
    await tx.workLog.updateMany({ where: { locationId: id }, data: { locationId: targetId } });
    await tx.location.delete({ where: { id } });
    return [assets.count, subs.count];
  });

  await logAudit({
    session,
    req,
    action: "DELETE",
    entityType: "Location",
    entityId: id,
    entityName: source.name,
    detail: { mergedInto: target.name, movedAssets, movedSublocations },
  });

  return NextResponse.json({ id: target.id, movedAssets, movedSublocations });
}
