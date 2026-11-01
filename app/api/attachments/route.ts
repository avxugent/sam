import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import type { Session } from "next-auth";
import { extname } from "path";
import { randomUUID } from "crypto";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { attemptStorage, getStorageDriver } from "@/lib/uploads/storage";
import { canEdit } from "@/lib/permissions";
import { formFile, formText, invalidInput, isForeignKeyError, readFormData, readJsonBody, unknownReferenceResponse } from "@/lib/route-helpers";
import { ATTACHMENT_EXTENSIONS, ATTACHMENT_MIME_TYPES, MAX_ATTACHMENT_BYTES, contentMatchesType, safeFilename } from "@/lib/uploads/policy";
import { MAX_ID_LENGTH } from "@/lib/schemas/ids";

const linkSchema = z.object({
  url: z.url().max(2000),
  label: z.string().min(1).max(255),
  description: z.string().max(2000).nullable().optional(),
  locationId: z.string().max(MAX_ID_LENGTH).optional().nullable(),
  assetId: z.string().max(MAX_ID_LENGTH).optional().nullable(),
});

/** The audit snapshot entry naming what the attachment was added to. */
async function parentSnapshot(locationId: string | null | undefined, assetId: string | null | undefined) {
  if (locationId) {
    const location = await prisma.location.findUnique({ where: { id: locationId }, select: { name: true } });
    return { Location: location?.name ?? locationId };
  }
  const asset = await prisma.asset.findUnique({ where: { id: assetId! }, select: { model: { select: { name: true } } } });
  return { Asset: asset?.model?.name ?? assetId! };
}

/** JSON body: an external link attached to a location or asset. */
async function createLinkAttachment(req: NextRequest, session: Session) {
  const body = await readJsonBody(req);
  const parsed = linkSchema.safeParse(body);
  if (!parsed.success) return invalidInput(parsed.error);
  const { url, label, description, locationId, assetId } = parsed.data;
  if (!locationId && !assetId) return NextResponse.json({ error: "locationId or assetId required." }, { status: 400 });

  let attachment;
  try {
    attachment = await prisma.attachment.create({
      data: {
        attachmentType: "link",
        url,
        originalName: label,
        description: description ?? null,
        locationId: locationId || null,
        assetId: assetId || null,
        uploadedById: session.user.id,
      },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });
  } catch (err) {
    if (isForeignKeyError(err)) return unknownReferenceResponse("The location or asset");
    throw err;
  }
  await logAudit({
    session,
    req,
    action: "CREATE",
    entityType: "Attachment",
    entityId: attachment.id,
    entityName: attachment.originalName,
    detail: {
      snapshot: {
        "Type": "link",
        ...(await parentSnapshot(locationId, assetId)),
      },
    },
  });
  return NextResponse.json(attachment, { status: 201 });
}

/** Multipart body: an uploaded file, validated and written to storage. */
async function createFileAttachment(req: NextRequest, session: Session) {
  const body = await readFormData(req);
  if ("error" in body) return body.error;
  const file = formFile(body.form, "file");
  // Empty fields count as absent, so an empty locationId never shadows an assetId.
  const locationId = formText(body.form, "locationId");
  const assetId = formText(body.form, "assetId");
  const rawDescription = formText(body.form, "description");
  const safeDescription = rawDescription?.replace(/[\r\n]{3,}/g, "\n\n").slice(0, 2000) || null;

  if (!file) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  if (!locationId && !assetId) return NextResponse.json({ error: "locationId or assetId required." }, { status: 400 });
  if (file.size > MAX_ATTACHMENT_BYTES) return NextResponse.json({ error: "File too large (max 50 MB)." }, { status: 400 });
  if (!ATTACHMENT_MIME_TYPES.has(file.type)) {
    return NextResponse.json({ error: "File type not allowed." }, { status: 400 });
  }

  // Validate and normalise the file extension
  const rawExt = extname(file.name).toLowerCase();
  const ext = ATTACHMENT_EXTENSIONS.has(rawExt) ? rawExt : "";

  // Reject IDs that would otherwise compose into a traversal-shaped key.
  // The storage driver enforces the ultimate safety boundary, but rejecting
  // bad input here gives a clean 400 instead of a 500.
  const idSegment = locationId ?? assetId ?? "";
  if (!/^[a-zA-Z0-9_-]+$/.test(idSegment)) {
    return NextResponse.json({ error: "Invalid path." }, { status: 400 });
  }

  const subDir = locationId ? `locations/${locationId}` : `assets/${assetId}`;
  const filename = `${randomUUID()}${ext}`;
  const relativePath = `${subDir}/${filename}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  // Validate actual file content against the declared MIME type
  if (!contentMatchesType(buffer, file.type)) {
    return NextResponse.json({ error: "File content does not match declared type." }, { status: 400 });
  }

  const stored = await attemptStorage("attachment write", "Could not store the file. Please try again.", () =>
    getStorageDriver().putObject(relativePath, buffer, file.type)
  );
  if ("error" in stored) return stored.error;

  // Remove the stored file again if the row cannot be written, so it is not orphaned.
  let attachment;
  try {
    attachment = await prisma.attachment.create({
      data: {
        filename,
        originalName: safeFilename(file.name),
        description: safeDescription,
        mimeType: file.type,
        size: file.size,
        path: relativePath,
        locationId,
        assetId,
        uploadedById: session.user.id,
      },
      include: {
        uploadedBy: { select: { id: true, name: true } },
      },
    });
  } catch (err) {
    await getStorageDriver()
      .deleteObject(relativePath)
      .catch((cleanupErr) => console.error("[storage] orphan cleanup failed", relativePath, cleanupErr));
    if (isForeignKeyError(err)) return unknownReferenceResponse("The location or asset");
    throw err;
  }

  await logAudit({
    session,
    req,
    action: "CREATE",
    entityType: "Attachment",
    entityId: attachment.id,
    entityName: attachment.originalName,
    detail: {
      snapshot: {
        "Type": "file",
        "MIME type": file.type,
        ...(await parentSnapshot(locationId, assetId)),
      },
    },
  });

  return NextResponse.json(attachment, { status: 201 });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const contentType = req.headers.get("content-type") ?? "";
  return contentType.includes("application/json")
    ? createLinkAttachment(req, session)
    : createFileAttachment(req, session);
}
