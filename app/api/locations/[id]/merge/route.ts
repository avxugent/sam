import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import type { Prisma } from "@/generated/prisma/client";
import { canEdit } from "@/lib/permissions";
import { mergeAuditDetail, mergeResponse, readMergeRequest } from "@/lib/route-helpers";

/**
 * Merge the location identified by [id] (the source) into another location
 * (the target). All of the source's assets, stock items, sub-locations,
 * attachments and work logs are reassigned to the target, then the source is
 * deleted (stock references its location with ON DELETE RESTRICT, so it has
 * to move first).
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
  const merge = await readMergeRequest(req, id, { article: "a", name: "location" }, (locationId) =>
    prisma.location.findUnique({ where: { id: locationId }, select: { id: true, name: true, parentId: true } })
  );
  if ("error" in merge) return merge.error;
  const { source, target, targetId } = merge;

  if (source.parentId !== target.parentId) {
    return NextResponse.json(
      { error: "Only locations under the same parent can be merged." },
      { status: 400 }
    );
  }

  const counts = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const assets = await tx.asset.updateMany({ where: { locationId: id }, data: { locationId: targetId } });
    const stock = await tx.stockItem.updateMany({ where: { locationId: id }, data: { locationId: targetId } });
    const subs = await tx.location.updateMany({ where: { parentId: id }, data: { parentId: targetId } });
    await tx.attachment.updateMany({ where: { locationId: id }, data: { locationId: targetId } });
    await tx.workLog.updateMany({ where: { locationId: id }, data: { locationId: targetId } });
    await tx.location.delete({ where: { id } });
    return { assetsMoved: assets.count, stockItemsMoved: stock.count, sublocationsMoved: subs.count };
  });

  await logAudit({
    session,
    req,
    action: "DELETE",
    entityType: "Location",
    entityId: id,
    entityName: source.name,
    detail: mergeAuditDetail(target.name, counts),
  });

  return mergeResponse(counts);
}
