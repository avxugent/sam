import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { canManageCatalog } from "@/lib/permissions";
import { invalidInput, isRecordNotFoundError, isUniqueConstraintError, readJsonBody, nameConflictResponse } from "@/lib/route-helpers";

const schema = z.object({ name: z.string().min(1).max(255) });

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCatalog(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await readJsonBody(req);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return invalidInput(parsed.error);

  const [existing, current] = await Promise.all([
    prisma.manufacturer.findFirst({
      where: { name: parsed.data.name, NOT: { id } },
      include: { _count: { select: { assets: true } } },
    }),
    prisma.manufacturer.findUnique({ where: { id }, select: { name: true } }),
  ]);
  if (existing) {
    return nameConflictResponse("Name already exists.", existing);
  }

  try {
    const manufacturer = await prisma.manufacturer.update({ where: { id }, data: { name: parsed.data.name } });
    await logAudit({
      session,
      req,
      action: "UPDATE",
      entityType: "Manufacturer",
      entityId: id,
      entityName: manufacturer.name,
      detail: current && current.name !== manufacturer.name
        ? { changes: { "Name": { from: current.name, to: manufacturer.name } } }
        : undefined,
    });
    return NextResponse.json(manufacturer);
  } catch (err) {
    if (isRecordNotFoundError(err)) {
      return NextResponse.json({ error: "Manufacturer not found." }, { status: 404 });
    }
    if (isUniqueConstraintError(err)) {
      return NextResponse.json({ error: "Name already exists." }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCatalog(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const manufacturer = await prisma.manufacturer.findUnique({ where: { id }, select: { name: true } });
  if (!manufacturer) return NextResponse.json({ error: "Manufacturer not found." }, { status: 404 });

  const count = await prisma.asset.count({ where: { manufacturerId: id } });
  if (count > 0) {
    return NextResponse.json(
      { error: `This manufacturer is used by ${count} asset(s). Reassign them first.` },
      { status: 400 }
    );
  }
  const modelCount = await prisma.model.count({ where: { manufacturerId: id } });
  if (modelCount > 0) {
    return NextResponse.json(
      { error: `This manufacturer has ${modelCount} model(s) defined. Delete or reassign them first.` },
      { status: 400 }
    );
  }

  await prisma.manufacturer.delete({ where: { id } });
  await logAudit({
    session,
    req,
    action: "DELETE",
    entityType: "Manufacturer",
    entityId: id,
    entityName: manufacturer.name,
  });
  return NextResponse.json({ ok: true });
}
