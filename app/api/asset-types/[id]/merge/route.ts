import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { isAdmin } from "@/lib/permissions";
import { mergeAuditDetail, mergeResponse, readMergeRequest } from "@/lib/route-helpers";
import { reassignModels } from "@/lib/models/reassign";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const merge = await readMergeRequest(req, id, { article: "an", name: "asset type" }, (tid) => prisma.assetType.findUnique({ where: { id: tid }, select: { id: true, name: true } }));
  if ("error" in merge) return merge.error;
  const { source, target, targetId } = merge;

  const counts = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const [assetResult, stockResult] = await Promise.all([
      tx.asset.updateMany({ where: { typeId: id }, data: { typeId: targetId } }),
      tx.stockItem.updateMany({ where: { typeId: id }, data: { typeId: targetId } }),
    ]);
    const models = await reassignModels(tx, { typeId: id }, { typeId: targetId });
    await tx.maintenancePreset.deleteMany({ where: { assetTypeId: id } });
    await tx.assetType.delete({ where: { id } });
    return { assetsMoved: assetResult.count, stockItemsMoved: stockResult.count, ...models };
  });

  await logAudit({
    session,
    req,
    action: "DELETE",
    entityType: "AssetType",
    entityId: id,
    entityName: source.name,
    detail: mergeAuditDetail(target.name, counts),
  });

  return mergeResponse(counts);
}
