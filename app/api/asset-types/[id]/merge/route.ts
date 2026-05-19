import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { logAudit } from "@/lib/audit";

const schema = z.object({ targetId: z.string().min(1) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { targetId } = parsed.data;

  if (id === targetId) {
    return NextResponse.json({ error: "Cannot merge an asset type into itself." }, { status: 400 });
  }

  const [source, target] = await Promise.all([
    prisma.assetType.findUnique({ where: { id }, select: { id: true, name: true } }),
    prisma.assetType.findUnique({ where: { id: targetId }, select: { id: true, name: true } }),
  ]);

  if (!source) return NextResponse.json({ error: "Source asset type not found." }, { status: 404 });
  if (!target) return NextResponse.json({ error: "Target asset type not found." }, { status: 404 });

  const { assetCount, stockCount } = await prisma.$transaction(async (tx: import("@/generated/prisma/client").Prisma.TransactionClient) => {
    const [assetResult, stockResult] = await Promise.all([
      tx.asset.updateMany({ where: { typeId: id }, data: { typeId: targetId } }),
      tx.stockItem.updateMany({ where: { typeId: id }, data: { typeId: targetId } }),
    ]);
    await tx.maintenancePreset.deleteMany({ where: { assetTypeId: id } });
    await tx.assetType.delete({ where: { id } });
    return { assetCount: assetResult.count, stockCount: stockResult.count };
  });

  await logAudit({
    session,
    req,
    action: "DELETE",
    entityType: "AssetType",
    entityId: id,
    entityName: source.name,
    detail: { changes: { "Merged into": { from: source.name, to: target.name }, "Assets moved": { from: 0, to: assetCount }, "Stock moved": { from: 0, to: stockCount } } },
  });

  return NextResponse.json({ ok: true, assetCount, stockCount });
}
