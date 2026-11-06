import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canEdit } from "@/lib/permissions";
import {
  invalidInput,
  isForeignKeyError,
  isUniqueConstraintError,
  nameTakenResponse,
  readJsonBody,
  unknownReferenceResponse,
} from "@/lib/route-helpers";
import { createLocationSchema } from "@/lib/schemas/location";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const locations = await prisma.location.findMany({
    where: { parentId: null },
    include: {
      _count: { select: { assets: true, children: true, stockItems: true } },
      children: {
        include: {
          _count: { select: { assets: true, children: true, stockItems: true } },
          children: {
            include: {
              _count: { select: { assets: true, children: true, stockItems: true } },
            },
            orderBy: [{ order: "asc" }, { name: "asc" }],
          },
        },
        orderBy: [{ order: "asc" }, { name: "asc" }],
      },
    },
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(locations);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await readJsonBody(req);
  const parsed = createLocationSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInput(parsed.error);
  }

  let location;
  try {
    location = await prisma.location.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        parentId: parsed.data.parentId ?? null,
        fiNumber: parsed.data.fiNumber ?? null,
        address: parsed.data.address ?? null,
        city: parsed.data.city ?? null,
        country: parsed.data.country ?? null,
      },
    });
  } catch (err: unknown) {
    if (isUniqueConstraintError(err)) return nameTakenResponse("This FI number is already assigned to another location.");
    if (isForeignKeyError(err)) return unknownReferenceResponse("The parent location");
    throw err;
  }

  await logAudit({
    session,
    req,
    action: "CREATE",
    entityType: "Location",
    entityId: location.id,
    entityName: location.name,
  });

  return NextResponse.json(location, { status: 201 });
}
