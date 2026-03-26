import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import { resolve, extname } from "path";
import { randomUUID } from "crypto";

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

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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

  const uploadRoot = resolve(process.cwd(), process.env.UPLOAD_DIR || "./uploads");
  const subDir = locationId ? `locations/${locationId}` : `assets/${assetId}`;
  const fullDir = resolve(uploadRoot, subDir);

  // Ensure subDir doesn't escape uploadRoot (e.g. via ../../ injection in locationId)
  if (!fullDir.startsWith(uploadRoot + "/") && fullDir !== uploadRoot) {
    return NextResponse.json({ error: "Invalid path." }, { status: 400 });
  }

  await mkdir(fullDir, { recursive: true });

  const filename = `${randomUUID()}${ext}`;
  const relativePath = `${subDir}/${filename}`;
  const fullPath = resolve(fullDir, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(fullPath, buffer);

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

  return NextResponse.json(attachment, { status: 201 });
}
