import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { unlink } from "fs/promises";
import { join, resolve } from "path";

/** Strip characters that could break HTTP headers or cause path traversal */
function safeFilename(name: string): string {
  return name.replace(/[\r\n\\"]/g, "_").slice(0, 255);
}

function getUploadRoot(): string {
  const uploadDir = process.env.UPLOAD_DIR || "./uploads";
  return resolve(process.cwd(), uploadDir);
}

/** Prevent path traversal: ensure resolvedPath is within uploadRoot */
function assertSafePath(uploadRoot: string, resolvedPath: string): void {
  if (!resolvedPath.startsWith(uploadRoot + "/") && resolvedPath !== uploadRoot) {
    throw new Error("Path traversal detected");
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const uploadRoot = getUploadRoot();
    const fullPath = resolve(uploadRoot, attachment.path);
    assertSafePath(uploadRoot, fullPath);
    await unlink(fullPath);
  } catch {
    // File may already be gone — continue with DB cleanup
  }

  await prisma.attachment.delete({ where: { id } });
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

  const uploadRoot = getUploadRoot();
  const fullPath = resolve(uploadRoot, attachment.path);

  try {
    assertSafePath(uploadRoot, fullPath);
  } catch {
    return NextResponse.json({ error: "Invalid path." }, { status: 400 });
  }

  const { readFile } = await import("fs/promises");
  try {
    const buffer = await readFile(fullPath);
    const safeName = safeFilename(attachment.originalName);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Content-Length": buffer.length.toString(),
        // Prevent browsers from caching sensitive files indefinitely
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found on disk." }, { status: 404 });
  }
}
