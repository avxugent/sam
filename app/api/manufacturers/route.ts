import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { canManageCatalog } from "@/lib/permissions";
import { invalidInput, isUniqueConstraintError, nameTakenResponse, readJsonBody } from "@/lib/route-helpers";
import { MAX_ID_LENGTH } from "@/lib/schemas/ids";

const schema = z.object({ name: z.string().min(1).max(255) });
const listQuerySchema = z.object({ typeId: z.string().max(MAX_ID_LENGTH).optional() });

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = listQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return invalidInput(parsed.error);
  const { typeId } = parsed.data;

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
    const manufacturer = await prisma.manufacturer.create({
      data: { name: parsed.data.name },
      // Same shape as a GET list item, so the client can insert it as-is.
      include: { _count: { select: { assets: true } } },
    });
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
      return nameTakenResponse();
    }
    throw err;
  }
}
