import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getStorageDriver, StorageNotFoundError } from "@/lib/storage";
import { z } from "zod";

const updateSchema = z.object({
  displayName: z.string().max(255).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  url: z.string().url().max(2048).nullable().optional(),
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
  if (session.user.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });

  if (parsed.data.url !== undefined && attachment.attachmentType !== "link") {
    return NextResponse.json({ error: "Cannot set URL on file attachments." }, { status: 400 });
  }

  const updated = await prisma.attachment.update({
    where: { id },
    data: {
      displayName: parsed.data.displayName ?? null,
      description: parsed.data.description ?? null,
      ...(parsed.data.url !== undefined && { url: parsed.data.url }),
    },
    include: { uploadedBy: { select: { id: true, name: true } } },
  });

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (parsed.data.displayName !== undefined && parsed.data.displayName !== attachment.displayName)
    changes["Display name"] = { from: attachment.displayName ?? null, to: parsed.data.displayName ?? null };
  if (parsed.data.description !== undefined && parsed.data.description !== attachment.description)
    changes["Description"] = { from: attachment.description ?? null, to: parsed.data.description ?? null };
  if (parsed.data.url !== undefined && parsed.data.url !== attachment.url)
    changes["URL"] = { from: attachment.url ?? null, to: parsed.data.url ?? null };

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
