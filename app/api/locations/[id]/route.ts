import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { logAudit } from "@/lib/audit";

// FI number format: CC.BB.FFF.RRR  e.g. "14.10.100.013"
const FI_NUMBER_REGEX = /^\d{2}\.\d{2}\.\d{3}\.\d{3}$/;

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional().nullable(),
  parentId: z.string().nullable().optional(),
  fiNumber: z
    .string()
    .max(20)
    .regex(FI_NUMBER_REGEX, "FI number must be in format CC.BB.FFF.RRR (e.g. 14.10.100.013)")
    .optional()
    .nullable(),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(255).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  coverImageId: z.string().optional().nullable(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const location = await prisma.location.findUnique({
    where: { id },
    include: {
      parent: { select: { id: true, name: true, parentId: true } },
      children: {
        include: {
          _count: { select: { assets: true, children: true } },
        },
        orderBy: [{ order: "asc" }, { name: "asc" }],
      },
      _count: { select: { assets: true, children: true, attachments: true } },
    },
  });

  if (!location) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(location);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  // Validate coverImageId: must be an image attachment belonging to this location
  if (parsed.data.coverImageId) {
    const cover = await prisma.attachment.findUnique({
      where: { id: parsed.data.coverImageId },
      select: { locationId: true, mimeType: true },
    });
    if (!cover || cover.locationId !== id || !cover.mimeType?.startsWith("image/")) {
      return NextResponse.json(
        { error: "Invalid cover image: must be an image attachment of this location." },
        { status: 400 }
      );
    }
  }

  let location;
  try {
    location = await prisma.location.update({
      where: { id },
      data: parsed.data,
    });
  } catch (err: unknown) {
    // P2002 = unique constraint violation (duplicate fiNumber)
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "This FI number is already assigned to another location." },
        { status: 409 }
      );
    }
    throw err;
  }

  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "Location",
    entityId: id,
    entityName: location.name,
    detail: { name: location.name, fiNumber: location.fiNumber },
  });

  return NextResponse.json(location);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const childCount = await prisma.location.count({ where: { parentId: id } });
  if (childCount > 0) {
    return NextResponse.json(
      { error: "Cannot delete a location that has sub-locations. Remove them first." },
      { status: 400 }
    );
  }

  const loc = await prisma.location.findUnique({ where: { id }, select: { name: true } });
  await prisma.location.delete({ where: { id } });
  await logAudit({
    session,
    req,
    action: "DELETE",
    entityType: "Location",
    entityId: id,
    entityName: loc?.name,
  });
  return NextResponse.json({ ok: true });
}
