import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { logAudit } from "@/lib/audit";
import { canManageCatalog } from "@/lib/permissions";

const schema = z.object({ targetId: z.string().min(1) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCatalog(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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

  // A Model is scoped to exactly one asset type, so every asset/stock item
  // that follows it must stay in sync with that type. A cross-type merge
  // (only reachable by an admin deliberately retyping a model into a
  // collision — the "possible duplicates" suggestions are same-type only)
  // carries that retype onto the rows being moved, rather than leaving them
  // pointed at a model whose type no longer matches their own.
  const retyped = source.typeId !== target.typeId;
  const data = retyped ? { modelId: targetId, typeId: target.typeId } : { modelId: targetId };

  const { assetsMoved, stockItemsMoved } = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const assetResult = await tx.asset.updateMany({
      where: { modelId: id },
      data,
    });
    const stockResult = await tx.stockItem.updateMany({
      where: { modelId: id },
      data,
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
      ...(retyped ? { retypedTo: target.typeId } : {}),
    },
  });

  return NextResponse.json({ ok: true, assetsMoved, stockItemsMoved });
}
