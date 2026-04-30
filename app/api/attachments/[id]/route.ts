import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getStorageDriver, StorageNotFoundError } from "@/lib/storage";

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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (attachment.attachmentType !== "link" && attachment.path) {
    try {
      await getStorageDriver().deleteObject(attachment.path);
    } catch {
      // File may already be gone — continue with DB cleanup
    }
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
  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to read file." }, { status: 500 });
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
