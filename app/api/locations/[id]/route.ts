import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { auditChanges } from "@/lib/audit/diff";
import { getAllDescendantLocationIds, getSubtreeIdsDeepestFirst } from "@/lib/locations/path";
import { canEdit, isAdmin } from "@/lib/permissions";
import { deleteStoredFiles } from "@/lib/uploads/storage";
import { invalidInput, isForeignKeyError, isRecordNotFoundError, isUniqueConstraintError, nameTakenResponse, notFoundResponse, readJsonBody, unknownReferenceResponse } from "@/lib/route-helpers";
import { updateLocationSchema } from "@/lib/schemas/location";
import { LOCATION_DETAIL_INCLUDE } from "@/lib/locations/include";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const location = await prisma.location.findUnique({
    where: { id },
    include: LOCATION_DETAIL_INCLUDE,
  });

  if (!location) return notFoundResponse("Location");
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

  const before = await prisma.location.findUnique({
    where: { id },
    include: { parent: { select: { name: true } } },
  });
  if (!before) return notFoundResponse("Location");

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
    if (!target) return unknownReferenceResponse("Target location");
    const descendants = await getAllDescendantLocationIds(id);
    if (descendants.includes(newParentId)) {
      return NextResponse.json(
        { error: "Cannot move a location into one of its own sub-locations." },
        { status: 400 }
      );
    }
  }

  // Detect a name collision with a sibling (same parent). Rather than silently
  // creating a duplicate, signal the client so it can offer to merge instead.
  if (parsed.data.name !== undefined && parsed.data.name !== before.name) {
    const effectiveParentId =
      parsed.data.parentId !== undefined ? parsed.data.parentId : before.parentId;
    const duplicate = await prisma.location.findFirst({
      where: { parentId: effectiveParentId, name: parsed.data.name, id: { not: id } },
      select: { id: true, name: true },
    });
    if (duplicate) {
      return NextResponse.json(
        {
          error: "A sibling location already has this name.",
          code: "locationNameExists",
          existingId: duplicate.id,
          existingName: duplicate.name,
        },
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
    // Deleted by a concurrent request since the read.
    if (isRecordNotFoundError(err)) return notFoundResponse("Location");
    // The new parent was deleted since the check above.
    if (isForeignKeyError(err)) return unknownReferenceResponse("Target location");
    if (isUniqueConstraintError(err)) return nameTakenResponse("This FI number is already assigned to another location.");
    throw err;
  }

  const d = parsed.data;
  const changes = auditChanges([
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
      ]);

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

  const loc = await prisma.location.findUnique({
    where: { id },
    select: { name: true, fiNumber: true, address: true, city: true, country: true },
  });
  if (!loc) return notFoundResponse("Location");

  const childCount = await prisma.location.count({ where: { parentId: id } });
  // Cascading takes the whole subtree with its assets, so it is Admin-only;
  // a leaf location stays deletable by any editor.
  if (childCount > 0 && !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Only admins can delete a location with sub-locations." }, { status: 403 });
  }
  if (childCount > 0 && !cascade) {
    return NextResponse.json(
      { error: "This location has sub-locations; confirm deleting them too.", code: "hasSublocations" },
      { status: 400 }
    );
  }

  // Stock storage location is onDelete: Restrict — check up front (across the
  // whole subtree when cascading) so this returns a friendly error instead of
  // an unhandled FK constraint failure mid-transaction below.
  const descendantIds = childCount > 0 ? await getAllDescendantLocationIds(id) : [];
  const locationIds = [id, ...descendantIds];
  const stockCount = await prisma.stockItem.count({
    where: { locationId: { in: locationIds } },
  });
  if (stockCount > 0) {
    return NextResponse.json(
      { error: "Stock items are still stored at this location or below it.", code: "hasStock" },
      { status: 400 }
    );
  }

  // The attachment rows cascade with their location or asset, so read the
  // stored files' paths now and remove the files once the rows are gone.
  const assetCount = await prisma.asset.count({ where: { locationId: { in: locationIds } } });
  const files = await prisma.attachment.findMany({
    where: {
      path: { not: null },
      OR: [{ locationId: { in: locationIds } }, { asset: { locationId: { in: locationIds } } }],
    },
    select: { path: true },
  });

  try {
    if (childCount > 0) {
      // Delete the whole subtree. The Location → parent relation is onDelete:
      // Restrict, so descendants must be removed deepest-first. Assets,
      // attachments and work logs cascade per location automatically.
      const subtree = await getSubtreeIdsDeepestFirst(id);
      await prisma.$transaction(subtree.map((locationId) => prisma.location.delete({ where: { id: locationId } })));
    } else {
      await prisma.location.delete({ where: { id } });
    }
  } catch (err) {
    // Deleted by a concurrent request since the read.
    if (isRecordNotFoundError(err)) return notFoundResponse("Location");
    throw err;
  }
  await deleteStoredFiles(files.flatMap((f) => (f.path ? [f.path] : [])));

  const snapshot = Object.fromEntries(
    Object.entries({
      "Name": loc.name,
      "FI number": loc.fiNumber,
      "Address": loc.address,
      "City": loc.city,
      "Country": loc.country,
    }).filter(([, v]) => v)
  );

  await logAudit({
    session,
    req,
    action: "DELETE",
    entityType: "Location",
    entityId: id,
    entityName: loc.name,
    detail: {
      snapshot,
      ...(childCount > 0 && { cascade: { locations: locationIds.length, assets: assetCount } }),
    },
  });
  return NextResponse.json({ ok: true });
}
