import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { extname } from "path";
import { randomUUID } from "crypto";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { getStorageDriver } from "@/lib/storage";

const MAX_SIZE = 50 * 1024 * 1024; // 50 MB
const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain", "text/csv",
]);

// Only allow safe extensions to land on disk, regardless of MIME claim
const ALLOWED_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".txt", ".csv",
]);

/**
 * Validate file content against known magic bytes for the declared MIME type.
 * This prevents a client from uploading a dangerous file with a spoofed MIME type.
 */
function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length < 4) return false;
  switch (mimeType) {
    case "image/jpeg":
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case "image/png":
      return (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
      );
    case "image/gif":
      return (
        buffer[0] === 0x47 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x38
      );
    case "image/webp":
      return (
        buffer.length >= 12 &&
        buffer[0] === 0x52 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x46 &&
        buffer[8] === 0x57 &&
        buffer[9] === 0x45 &&
        buffer[10] === 0x42 &&
        buffer[11] === 0x50
      );
    case "application/pdf":
      return (
        buffer[0] === 0x25 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x44 &&
        buffer[3] === 0x46
      );
    case "application/msword":
      // Legacy .doc — Compound Document File (OLE2)
      return (
        buffer[0] === 0xd0 &&
        buffer[1] === 0xcf &&
        buffer[2] === 0x11 &&
        buffer[3] === 0xe0
      );
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.ms-excel":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      // OOXML (.docx, .xlsx) and .xls (when misreported) are ZIP archives
      return (
        buffer[0] === 0x50 &&
        buffer[1] === 0x4b &&
        buffer[2] === 0x03 &&
        buffer[3] === 0x04
      );
    case "image/svg+xml":
    case "text/plain":
    case "text/csv":
      // Text formats: reject files containing null bytes in the first 512 bytes,
      // which would indicate binary content masquerading as text
      return !buffer.subarray(0, 512).includes(0x00);
    default:
      return false;
  }
}

const linkSchema = z.object({
  url: z.string().url().max(2000),
  label: z.string().min(1).max(255),
  locationId: z.string().optional().nullable(),
  assetId: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const contentType = req.headers.get("content-type") ?? "";

  // ── Link attachment (JSON body) ──────────────────────────────────────────
  if (contentType.includes("application/json")) {
    const body = await req.json();
    const parsed = linkSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });
    const { url, label, locationId, assetId } = parsed.data;
    if (!locationId && !assetId) return NextResponse.json({ error: "locationId or assetId required." }, { status: 400 });

    const attachment = await prisma.attachment.create({
      data: {
        attachmentType: "link",
        url,
        originalName: label,
        locationId: locationId || null,
        assetId: assetId || null,
        uploadedById: session.user.id,
      },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });
    await logAudit({
      session,
      req,
      action: "CREATE",
      entityType: "Attachment",
      entityId: attachment.id,
      entityName: attachment.originalName,
      detail: { type: "link", locationId: attachment.locationId, assetId: attachment.assetId },
    });
    return NextResponse.json(attachment, { status: 201 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const locationId = formData.get("locationId") as string | null;
  const assetId = formData.get("assetId") as string | null;

  if (!file) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  if (!locationId && !assetId) return NextResponse.json({ error: "locationId or assetId required." }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "File too large (max 50 MB)." }, { status: 400 });
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "File type not allowed." }, { status: 400 });
  }

  // Validate and normalise the file extension
  const rawExt = extname(file.name).toLowerCase();
  const ext = ALLOWED_EXTENSIONS.has(rawExt) ? rawExt : "";

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
  if (!validateMagicBytes(buffer, file.type)) {
    return NextResponse.json({ error: "File content does not match declared type." }, { status: 400 });
  }

  await getStorageDriver().putObject(relativePath, buffer, file.type);

  // Sanitize original name stored in DB (strip control chars)
  const safeOriginalName = file.name.replace(/[\r\n\\"]/g, "_").slice(0, 255);

  const attachment = await prisma.attachment.create({
    data: {
      filename,
      originalName: safeOriginalName,
      mimeType: file.type,
      size: file.size,
      path: relativePath,
      locationId: locationId || null,
      assetId: assetId || null,
      uploadedById: session.user.id,
    },
    include: {
      uploadedBy: { select: { id: true, name: true } },
    },
  });

  await logAudit({
    session,
    req,
    action: "CREATE",
    entityType: "Attachment",
    entityId: attachment.id,
    entityName: attachment.originalName,
    detail: { type: "file", locationId: attachment.locationId, assetId: attachment.assetId },
  });

  return NextResponse.json(attachment, { status: 201 });
}
