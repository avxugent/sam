import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { canManageCatalog } from "@/lib/permissions";
import { invalidInput, readJsonBody } from "@/lib/route-helpers";

const updateSchema = z.object({
  typeId: z.string().min(1),
  manufacturerId: z.string().min(1).optional().nullable(),
  name: z.string().min(1).max(255),
  documentationUrl: z.string().url().max(2048).nullable().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCatalog(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await readJsonBody(req);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return invalidInput(parsed.error);

  const { typeId, name } = parsed.data;
  const manufacturerId = parsed.data.manufacturerId || null;
  const documentationUrl = parsed.data.documentationUrl || null;

  const [current, existing] = await Promise.all([
    prisma.model.findUnique({ where: { id }, select: { typeId: true, manufacturerId: true, name: true, documentationUrl: true } }),
    prisma.model.findFirst({
      where: { typeId, manufacturerId, name, NOT: { id } },
      include: { _count: { select: { assets: true, stockItems: true } } },
    }),
  ]);
  if (!current) return NextResponse.json({ error: "Model not found." }, { status: 404 });
  if (existing) {
    return NextResponse.json(
      {
        error: `"${existing.name}" already exists for this type/manufacturer.`,
        existingId: existing.id,
        existingName: existing.name,
        existingAssetCount: existing._count.assets,
        existingStockCount: existing._count.stockItems,
      },
      { status: 409 }
    );
  }

  const model = await prisma.model.update({ where: { id }, data: { typeId, manufacturerId, name, documentationUrl } });

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (current.typeId !== typeId) changes["Asset type"] = { from: current.typeId, to: typeId };
  if (current.manufacturerId !== manufacturerId) changes["Manufacturer"] = { from: current.manufacturerId, to: manufacturerId };
  if (current.name !== name) changes["Name"] = { from: current.name, to: name };
  if (current.documentationUrl !== documentationUrl) changes["Documentation URL"] = { from: current.documentationUrl, to: documentationUrl };

  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "Model",
    entityId: id,
    entityName: model.name,
    detail: Object.keys(changes).length > 0 ? { changes } : undefined,
  });

  return NextResponse.json(model);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCatalog(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const [assetCount, stockCount] = await Promise.all([
    prisma.asset.count({ where: { modelId: id } }),
    prisma.stockItem.count({ where: { modelId: id } }),
  ]);
  if (assetCount > 0 || stockCount > 0) {
    return NextResponse.json(
      { error: `This model is used by ${assetCount} asset(s) and ${stockCount} stock item(s). Reassign or merge them first.` },
      { status: 400 }
    );
  }

  const model = await prisma.model.findUnique({ where: { id }, select: { name: true } });
  await prisma.model.delete({ where: { id } });
  await logAudit({
    session,
    req,
    action: "DELETE",
    entityType: "Model",
    entityId: id,
    entityName: model?.name,
  });
  return NextResponse.json({ ok: true });
}
