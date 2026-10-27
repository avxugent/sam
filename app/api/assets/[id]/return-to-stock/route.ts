import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import type { Prisma } from "@/generated/prisma/client";
import { AssetLifecycleError, assertReturnableToStock, buildReturnToStockStockItemData } from "@/lib/asset-lifecycle";
import { canEdit } from "@/lib/permissions";

const schema = z.object({
  locationId: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { locationId } = parsed.data;

  const location = await prisma.location.findUnique({ where: { id: locationId }, select: { id: true } });
  if (!location) return NextResponse.json({ error: "Location not found" }, { status: 400 });

  const { id } = await params;

  const asset = await prisma.asset.findUnique({
    where: { id },
    include: {
      location: { select: { name: true } },
      model: { select: { name: true } },
      macAddresses: { select: { address: true } },
      customFields: { select: { key: true, value: true } },
    },
  });
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    assertReturnableToStock(asset);
  } catch (err) {
    if (err instanceof AssetLifecycleError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  const stockItem = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const item = await tx.stockItem.create({ data: buildReturnToStockStockItemData(asset, locationId) });
    await tx.asset.delete({ where: { id } });
    return item;
  });

  await Promise.all([
    logAudit({
      session,
      req,
      action: "DELETE",
      entityType: "Asset",
      entityId: id,
      entityName: asset.model?.name ?? undefined,
      detail: { snapshot: { "Returned to stock": asset.model?.name ?? null, "From location": asset.location.name } },
      lineageId: asset.lineageId,
    }),
    logAudit({
      session,
      req,
      action: "CREATE",
      entityType: "StockItem",
      entityId: stockItem.id,
      entityName: asset.model?.name,
      detail: { snapshot: { "Returned from asset at": asset.location.name } },
      lineageId: stockItem.lineageId,
    }),
  ]);

  return NextResponse.json({ stockItemId: stockItem.id });
}
