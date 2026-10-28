import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { canManageCatalog } from "@/lib/permissions";
import { invalidInput, isUniqueConstraintError, readJsonBody } from "@/lib/route-helpers";

const schema = z.object({ name: z.string().min(1).max(255) });

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const typeId = searchParams.get("typeId") || undefined;

  const manufacturers = await prisma.manufacturer.findMany({
    where: typeId ? { models: { some: { typeId } } } : undefined,
    orderBy: { name: "asc" },
    include: { _count: { select: { assets: true } } },
  });
  return NextResponse.json(manufacturers);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCatalog(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await readJsonBody(req);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    const manufacturer = await prisma.manufacturer.create({ data: { name: parsed.data.name } });
    await logAudit({
      session,
      req,
      action: "CREATE",
      entityType: "Manufacturer",
      entityId: manufacturer.id,
      entityName: manufacturer.name,
    });
    return NextResponse.json(manufacturer, { status: 201 });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return NextResponse.json({ error: "Name already exists." }, { status: 409 });
    }
    throw err;
  }
}
