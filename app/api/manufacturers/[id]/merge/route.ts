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
  if (session.user.role !== "ADMIN" && session.user.role !== "MAINTAINER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { targetId } = parsed.data;

  if (id === targetId) {
    return NextResponse.json({ error: "Cannot merge a manufacturer into itself." }, { status: 400 });
  }

  const [source, target] = await Promise.all([
    prisma.manufacturer.findUnique({ where: { id } }),
    prisma.manufacturer.findUnique({ where: { id: targetId } }),
  ]);

  if (!source) return NextResponse.json({ error: "Source manufacturer not found." }, { status: 404 });
  if (!target) return NextResponse.json({ error: "Target manufacturer not found." }, { status: 404 });

  const movedCount = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
    await tx.manufacturer.delete({ where: { id } });
    return result.count;
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
    },
  });

  return NextResponse.json({ ok: true, movedCount });
}
