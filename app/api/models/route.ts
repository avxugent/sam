import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { canManageCatalog } from "@/lib/permissions";
import { invalidInput, isUniqueConstraintError, readJsonBody } from "@/lib/route-helpers";

const createSchema = z.object({
  typeId: z.string().min(1),
  manufacturerId: z.string().min(1).optional().nullable(),
  name: z.string().min(1).max(255),
  // Required for compliance, but intentionally not enforced here — see the
  // comment on Model.documentationUrl in schema.prisma.
  documentationUrl: z.url().max(2048).nullable().optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || undefined;
  const typeId = searchParams.get("typeId") || undefined;
  const manufacturerId = searchParams.get("manufacturerId") || undefined;

  const models = await prisma.model.findMany({
    where: {
      ...(q ? { name: { contains: q } } : {}),
      ...(typeId ? { typeId } : {}),
      ...(manufacturerId ? { manufacturerId } : {}),
    },
    select: {
      id: true,
      name: true,
      typeId: true,
      manufacturerId: true,
      type: { select: { name: true } },
      manufacturer: { select: { name: true } },
    },
    orderBy: { name: "asc" },
    take: 200,
  });

  return NextResponse.json(
    models.map((m) => ({
      id: m.id,
      name: m.name,
      typeId: m.typeId,
      manufacturerId: m.manufacturerId,
      typeName: m.type.name,
      manufacturerName: m.manufacturer?.name ?? null,
    }))
  );
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCatalog(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await readJsonBody(req);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return invalidInput(parsed.error);

  const { typeId, name } = parsed.data;
  const manufacturerId = parsed.data.manufacturerId || null;
  const documentationUrl = parsed.data.documentationUrl || null;

  const type = await prisma.assetType.findUnique({ where: { id: typeId }, select: { name: true } });
  if (!type) return NextResponse.json({ error: "Asset type not found." }, { status: 404 });
  let manufacturer: { name: string } | null = null;
  if (manufacturerId) {
    manufacturer = await prisma.manufacturer.findUnique({ where: { id: manufacturerId }, select: { name: true } });
    if (!manufacturer) return NextResponse.json({ error: "Manufacturer not found." }, { status: 404 });
  }

  // Explicit pre-check rather than relying solely on the
  // @@unique([typeId, manufacturerId, name]) constraint: MySQL unique indexes
  // treat multiple NULLs as distinct, so two manufacturer-less models with
  // the same (typeId, name) would NOT collide at the DB level. (Plain
  // `equals` is already case-insensitive here — the column's default MySQL
  // collation folds case, same as every other lookup-table name check in
  // this codebase.)
  const existing = await prisma.model.findFirst({
    where: { typeId, manufacturerId, name },
  });
  if (existing) {
    return NextResponse.json(
      { error: `"${existing.name}" already exists for this type/manufacturer.`, existingId: existing.id, existingName: existing.name },
      { status: 409 }
    );
  }

  try {
    const model = await prisma.model.create({ data: { typeId, manufacturerId, name, documentationUrl } });
    await logAudit({
      session,
      req,
      action: "CREATE",
      entityType: "Model",
      entityId: model.id,
      entityName: `${type.name} / ${manufacturer?.name ?? "—"} / ${model.name}`,
    });
    return NextResponse.json(model, { status: 201 });
  } catch (err: unknown) {
    if (isUniqueConstraintError(err)) {
      return NextResponse.json({ error: `"${name}" already exists for this type/manufacturer.` }, { status: 409 });
    }
    throw err;
  }
}
