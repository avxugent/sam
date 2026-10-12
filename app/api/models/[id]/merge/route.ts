import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
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
    return NextResponse.json({ error: "Cannot merge a model into itself." }, { status: 400 });
  }

  const [source, target] = await Promise.all([
    prisma.model.findUnique({ where: { id } }),
    prisma.model.findUnique({ where: { id: targetId } }),
  ]);

  if (!source) return NextResponse.json({ error: "Source model not found." }, { status: 404 });
  if (!target) return NextResponse.json({ error: "Target model not found." }, { status: 404 });

  if (source.typeId !== target.typeId) {
    return NextResponse.json(
      { error: "Cannot merge models that belong to different asset types." },
      { status: 400 }
    );
  }

  const { assetsMoved, stockItemsMoved } = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const assetResult = await tx.asset.updateMany({
      where: { modelId: id },
      data: { modelId: targetId },
    });
    const stockResult = await tx.stockItem.updateMany({
      where: { modelId: id },
      data: { modelId: targetId },
    });
    await tx.model.delete({ where: { id } });
    return { assetsMoved: assetResult.count, stockItemsMoved: stockResult.count };
  });

  await logAudit({
    session,
    req,
    action: "DELETE",
    entityType: "Model",
    entityId: id,
    entityName: source.name,
    detail: {
      mergedInto: { id: targetId, name: target.name },
      assetsMoved,
      stockItemsMoved,
    },
  });

  return NextResponse.json({ ok: true, assetsMoved, stockItemsMoved });
}
