import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { unlink, realpath } from "fs/promises";
import { resolve } from "path";
import { logAudit } from "@/lib/audit";

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

function getUploadRoot(): string {
  const uploadDir = process.env.UPLOAD_DIR || "./uploads";
  return resolve(process.cwd(), uploadDir);
}

/**
 * Prevent path traversal: ensure resolvedPath is within uploadRoot.
 * Uses realpath() to follow symlinks so a symlink pointing outside the upload
 * root cannot be used to read or delete arbitrary files.
 */
async function assertSafePath(uploadRoot: string, resolvedPath: string): Promise<void> {
  let realRoot: string;
  let realPath: string;
  try {
    [realRoot, realPath] = await Promise.all([realpath(uploadRoot), realpath(resolvedPath)]);
  } catch {
    // Fall back to string-based check when the path doesn't exist yet or
    // realpath fails for any other reason
    if (!resolvedPath.startsWith(uploadRoot + "/") && resolvedPath !== uploadRoot) {
      throw new Error("Path traversal detected");
    }
    return;
  }
  if (!realPath.startsWith(realRoot + "/") && realPath !== realRoot) {
    throw new Error("Path traversal detected");
  }
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
      const uploadRoot = getUploadRoot();
      const fullPath = resolve(uploadRoot, attachment.path);
      await assertSafePath(uploadRoot, fullPath);
      await unlink(fullPath);
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

  const uploadRoot = getUploadRoot();
  const fullPath = resolve(uploadRoot, attachment.path ?? "");

  try {
    await assertSafePath(uploadRoot, fullPath);
  } catch {
    return NextResponse.json({ error: "Invalid path." }, { status: 400 });
  }

  const { readFile } = await import("fs/promises");
  try {
    const buffer = await readFile(fullPath);
    const safeName = safeFilename(attachment.originalName);
    // SVG files can execute scripts when rendered inline — always force download
    const disposition =
      attachment.mimeType === "image/svg+xml" ? "attachment" : "inline";
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": attachment.mimeType ?? "application/octet-stream",
        "Content-Disposition": contentDispositionHeader(disposition, safeName),
        "Content-Length": buffer.length.toString(),
        // Prevent browsers from caching sensitive files indefinitely
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found on disk." }, { status: 404 });
  }
}
