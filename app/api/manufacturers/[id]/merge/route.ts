import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import type { Prisma } from "@/generated/prisma/client";
import { logAudit } from "@/lib/audit";
import { canManageCatalog } from "@/lib/permissions";
import { readMergeRequest } from "@/lib/route-helpers";
import { reassignModels } from "@/lib/models/reassign";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCatalog(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const merge = await readMergeRequest(req, id, { article: "a", name: "manufacturer" }, (mid) => prisma.manufacturer.findUnique({ where: { id: mid } }));
  if ("error" in merge) return merge.error;
  const { source, target, targetId } = merge;

  const { movedCount, stockMoved, modelsMoved, modelsFolded } = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Reassign scrape template overrides from source to target. Where both
    // manufacturers have an override for the same asset type, the unique
    // (typeId, manufacturerId) constraint would collide — keep the target's
    // existing override and drop the source's rather than crash the merge.
    const sourceOverrides = await tx.assetTypeManufacturerTemplate.findMany({
      where: { manufacturerId: id },
    });
    for (const override of sourceOverrides) {
      const targetOverride = await tx.assetTypeManufacturerTemplate.findUnique({
        where: { typeId_manufacturerId: { typeId: override.typeId, manufacturerId: targetId } },
      });
      if (targetOverride) {
        await tx.assetTypeManufacturerTemplate.delete({ where: { id: override.id } });
      } else {
        await tx.assetTypeManufacturerTemplate.update({
          where: { id: override.id },
          data: { manufacturerId: targetId },
        });
      }
    }

    const result = await tx.asset.updateMany({
      where: { manufacturerId: id },
      data: { manufacturerId: targetId },
    });
    // Stock and models reference the manufacturer with ON DELETE SET NULL —
    // move them too, or deleting the source silently strips their brand.
    const stockResult = await tx.stockItem.updateMany({
      where: { manufacturerId: id },
      data: { manufacturerId: targetId },
    });
    const models = await reassignModels(tx, { manufacturerId: id }, { manufacturerId: targetId });
    await tx.manufacturer.delete({ where: { id } });
    return { movedCount: result.count, stockMoved: stockResult.count, ...models };
  });

  await logAudit({
    session,
    req,
    action: "DELETE",
    entityType: "Manufacturer",
    entityId: id,
    entityName: source.name,
    detail: {
      mergedInto: { id: targetId, name: target.name },
      assetsMoved: movedCount,
      stockMoved,
      modelsMoved,
      modelsFolded,
    },
  });

  return NextResponse.json({ ok: true, movedCount });
}
