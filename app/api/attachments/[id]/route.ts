import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { auditChanges } from "@/lib/audit/diff";
import { attemptStorage, getStorageDriver, StorageNotFoundError } from "@/lib/storage";
import { z } from "zod";
import { canEdit } from "@/lib/permissions";
import { invalidInput, notFoundResponse, readJsonBody } from "@/lib/route-helpers";

const updateSchema = z.object({
  displayName: z.string().max(255).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  url: z.url().max(2048).nullable().optional(),
});

/** Strip characters that could break HTTP headers or cause path traversal */
function safeFilename(name: string): string {
  return name.replace(/[\r\n\\"]/g, "_").slice(0, 255);
}

/**
 * Build a RFC 6266-compliant Content-Disposition header value.
 * Includes both the legacy `filename` parameter (ASCII) and
 * the `filename*` parameter (UTF-8 percent-encoded) for maximum compatibility.
 */
function contentDispositionHeader(disposition: "inline" | "attachment", filename: string): string {
  const encoded = encodeURIComponent(filename);
  return `${disposition}; filename="${filename}"; filename*=UTF-8''${encoded}`;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) return notFoundResponse();

  const body = await readJsonBody(req);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return invalidInput(parsed.error);

  if (parsed.data.url !== undefined && attachment.attachmentType !== "link") {
    return NextResponse.json({ error: "Cannot set URL on file attachments." }, { status: 400 });
  }

  const updated = await prisma.attachment.update({
    where: { id },
    // PATCH semantics: omitted fields keep their value, null clears them.
    data: {
      ...(parsed.data.displayName !== undefined && { displayName: parsed.data.displayName }),
      ...(parsed.data.description !== undefined && { description: parsed.data.description }),
      ...(parsed.data.url !== undefined && { url: parsed.data.url }),
    },
    include: { uploadedBy: { select: { id: true, name: true } } },
  });

  const d = parsed.data;
  const changes = auditChanges([
    d.displayName !== undefined && { label: "Display name", before: attachment.displayName, after: d.displayName },
    d.description !== undefined && { label: "Description", before: attachment.description, after: d.description },
    d.url !== undefined && { label: "URL", before: attachment.url, after: d.url },
  ]);

  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "Attachment",
    entityId: id,
    entityName: updated.displayName ?? updated.originalName,
    detail: Object.keys(changes).length > 0 ? { changes } : undefined,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) return notFoundResponse();

  if (attachment.attachmentType !== "link" && attachment.path) {
    // Drivers already treat a missing file as deleted. Any other storage
    // failure keeps the row, so the delete can be retried instead of leaving
    // an orphaned file nothing points at.
    const path = attachment.path;
    const removed = await attemptStorage(
      "attachment delete",
      "Could not delete the stored file. The attachment was kept; please try again.",
      () => getStorageDriver().deleteObject(path)
    );
    if ("error" in removed) return removed.error;
  }

  await prisma.attachment.delete({ where: { id } });
  await logAudit({
    session,
    req,
    action: "DELETE",
    entityType: "Attachment",
    entityId: id,
    entityName: attachment.originalName,
  });
  return NextResponse.json({ ok: true });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) return notFoundResponse();

  // Link attachments: redirect to the stored URL
  if (attachment.attachmentType === "link" && attachment.url) {
    return NextResponse.redirect(attachment.url);
  }

  if (!attachment.path) {
    return NextResponse.json({ error: "Attachment has no stored content." }, { status: 404 });
  }

  let buffer: Buffer;
  try {
    buffer = await getStorageDriver().getObject(attachment.path);
  } catch (err) {
    if (err instanceof StorageNotFoundError) {
      return notFoundResponse("File");
    }
    console.error("[attachments] storage read failed", err);
    return NextResponse.json({ error: "Could not read the stored file. Please try again." }, { status: 502 });
  }

  const safeName = safeFilename(attachment.originalName);
  // SVG files can execute scripts when rendered inline — always force download
  const disposition =
    attachment.mimeType === "image/svg+xml" ? "attachment" : "inline";
  return new NextResponse(buffer as BodyInit, {
    headers: {
      "Content-Type": attachment.mimeType ?? "application/octet-stream",
      "Content-Disposition": contentDispositionHeader(disposition, safeName),
      "Content-Length": buffer.length.toString(),
      // Prevent browsers from caching sensitive files indefinitely
      "Cache-Control": "private, max-age=3600",
    },
  });
}
