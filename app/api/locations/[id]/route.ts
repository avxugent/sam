import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { auditChanges } from "@/lib/audit-diff";
import { getAllDescendantLocationIds } from "@/lib/location-path";
import { canEdit } from "@/lib/permissions";
import { invalidInput, isUniqueConstraintError, readJsonBody } from "@/lib/route-helpers";
import { updateLocationSchema } from "@/lib/schemas/location";

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
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await readJsonBody(req);
  const parsed = updateLocationSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInput(parsed.error);
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

  // Only rooms (leaf locations) may be placed in maintenance. Un-setting is
  // always allowed, even if the location later gained children.
  if (parsed.data.inMaintenance === true) {
    const childCount = await prisma.location.count({ where: { parentId: id } });
    if (childCount > 0) {
      return NextResponse.json(
        { error: "Only rooms (locations without sub-locations) can be placed in maintenance." },
        { status: 400 }
      );
    }
  }

  // Validate parent move: prevent cycles and dangling references
  if (parsed.data.parentId !== undefined && parsed.data.parentId !== null) {
    const newParentId = parsed.data.parentId;
    if (newParentId === id) {
      return NextResponse.json(
        { error: "A location cannot be its own parent." },
        { status: 400 }
      );
    }
    const target = await prisma.location.findUnique({
      where: { id: newParentId },
      select: { id: true },
    });
    if (!target) {
      return NextResponse.json(
        { error: "Target location does not exist." },
        { status: 400 }
      );
    }
    const descendants = await getAllDescendantLocationIds(id);
    if (descendants.includes(newParentId)) {
      return NextResponse.json(
        { error: "Cannot move a location into one of its own sub-locations." },
        { status: 400 }
      );
    }
  }

  const before = await prisma.location.findUnique({
    where: { id },
    include: { parent: { select: { name: true } } },
  });

  // Detect a name collision with a sibling (same parent). Rather than silently
  // creating a duplicate, signal the client so it can offer to merge instead.
  if (before && parsed.data.name !== undefined && parsed.data.name !== before.name) {
    const effectiveParentId =
      parsed.data.parentId !== undefined ? parsed.data.parentId : before.parentId;
    const duplicate = await prisma.location.findFirst({
      where: { parentId: effectiveParentId, name: parsed.data.name, id: { not: id } },
      select: { id: true, name: true },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: "LOCATION_NAME_EXISTS", targetId: duplicate.id, targetName: duplicate.name },
        { status: 409 }
      );
    }
  }

  let location;
  try {
    location = await prisma.location.update({
      where: { id },
      data: parsed.data,
      include: { parent: { select: { name: true } } },
    });
  } catch (err: unknown) {
    if (isUniqueConstraintError(err)) {
      return NextResponse.json(
        { error: "This FI number is already assigned to another location." },
        { status: 409 }
      );
    }
    throw err;
  }

  const d = parsed.data;
  const changes = before
    ? auditChanges([
        d.name !== undefined && { label: "Name", before: before.name, after: d.name },
        d.description !== undefined && { label: "Description", before: before.description, after: d.description },
        d.fiNumber !== undefined && { label: "FI number", before: before.fiNumber, after: d.fiNumber },
        d.address !== undefined && { label: "Address", before: before.address, after: d.address },
        d.city !== undefined && { label: "City", before: before.city, after: d.city },
        d.country !== undefined && { label: "Country", before: before.country, after: d.country },
        d.parentId !== undefined && { label: "Parent", before: before.parentId, after: d.parentId, display: [before.parent?.name, location.parent?.name] },
        d.latitude !== undefined && { label: "Latitude", before: before.latitude, after: d.latitude },
        d.longitude !== undefined && { label: "Longitude", before: before.longitude, after: d.longitude },
        d.inMaintenance !== undefined && { label: "In maintenance", before: before.inMaintenance, after: d.inMaintenance },
      ])
    : {};

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
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const cascade = req.nextUrl.searchParams.get("cascade") === "true";

  const childCount = await prisma.location.count({ where: { parentId: id } });
  if (childCount > 0 && !cascade) {
    return NextResponse.json(
      { error: "HAS_SUBLOCATIONS" },
      { status: 400 }
    );
  }

  // Stock storage location is onDelete: Restrict — check up front (across the
  // whole subtree when cascading) so this returns a friendly error instead of
  // an unhandled FK constraint failure mid-transaction below.
  const descendantIds = childCount > 0 ? await getAllDescendantLocationIds(id) : [];
  const stockCount = await prisma.stockItem.count({
    where: { locationId: { in: [id, ...descendantIds] } },
  });
  if (stockCount > 0) {
    return NextResponse.json(
      { error: "HAS_STOCK" },
      { status: 400 }
    );
  }

  const loc = await prisma.location.findUnique({
    where: { id },
    select: { name: true, fiNumber: true, address: true, city: true, country: true },
  });

  if (childCount > 0) {
    // Delete the whole subtree. The Location → parent relation is onDelete:
    // Restrict, so descendants must be removed deepest-first. Assets,
    // attachments and work logs cascade per location automatically.
    const subtree = await prisma.$queryRaw<{ id: string; depth: number }[]>`
      WITH RECURSIVE loc_tree AS (
        SELECT id, 0 AS depth FROM locations WHERE id = ${id}
        UNION ALL
        SELECT l.id, lt.depth + 1 FROM locations l
        INNER JOIN loc_tree lt ON l.parentId = lt.id
      )
      SELECT id, depth FROM loc_tree ORDER BY depth DESC
    `;
    await prisma.$transaction(
      subtree.map((row) => prisma.location.delete({ where: { id: row.id } }))
    );
  } else {
    await prisma.location.delete({ where: { id } });
  }

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
