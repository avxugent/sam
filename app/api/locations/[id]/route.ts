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

  const before = await prisma.location.findUnique({
    where: { id },
    include: { parent: { select: { name: true } } },
  });

  let location;
  try {
    location = await prisma.location.update({
      where: { id },
      data: parsed.data,
      include: { parent: { select: { name: true } } },
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

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (before) {
    const d = parsed.data;
    if (d.name !== undefined && d.name !== before.name)
      changes["Name"] = { from: before.name, to: d.name };
    if (d.description !== undefined && d.description !== before.description)
      changes["Description"] = { from: before.description ?? null, to: d.description ?? null };
    if (d.fiNumber !== undefined && d.fiNumber !== before.fiNumber)
      changes["FI number"] = { from: before.fiNumber ?? null, to: d.fiNumber ?? null };
    if (d.address !== undefined && d.address !== before.address)
      changes["Address"] = { from: before.address ?? null, to: d.address ?? null };
    if (d.city !== undefined && d.city !== before.city)
      changes["City"] = { from: before.city ?? null, to: d.city ?? null };
    if (d.country !== undefined && d.country !== before.country)
      changes["Country"] = { from: before.country ?? null, to: d.country ?? null };
    if (d.parentId !== undefined && d.parentId !== before.parentId)
      changes["Parent"] = { from: before.parent?.name ?? null, to: location.parent?.name ?? null };
    if (d.latitude !== undefined && d.latitude !== before.latitude)
      changes["Latitude"] = { from: before.latitude ?? null, to: d.latitude ?? null };
    if (d.longitude !== undefined && d.longitude !== before.longitude)
      changes["Longitude"] = { from: before.longitude ?? null, to: d.longitude ?? null };
  }

  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "Location",
    entityId: id,
    entityName: location.name,
    detail: Object.keys(changes).length > 0 ? { changes } : undefined,
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
      { error: "HAS_SUBLOCATIONS" },
      { status: 400 }
    );
  }

  const loc = await prisma.location.findUnique({
    where: { id },
    select: { name: true, fiNumber: true, address: true, city: true, country: true },
  });
  await prisma.location.delete({ where: { id } });

  const snapshot: Record<string, string> = {};
  if (loc) {
    if (loc.name) snapshot["Name"] = loc.name;
    if (loc.fiNumber) snapshot["FI number"] = loc.fiNumber;
    if (loc.address) snapshot["Address"] = loc.address;
    if (loc.city) snapshot["City"] = loc.city;
    if (loc.country) snapshot["Country"] = loc.country;
  }

  await logAudit({
    session,
    req,
    action: "DELETE",
    entityType: "Location",
    entityId: id,
    entityName: loc?.name,
    detail: Object.keys(snapshot).length > 0 ? { snapshot } : undefined,
  });
  return NextResponse.json({ ok: true });
}
