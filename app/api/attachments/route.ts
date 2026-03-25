import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import { join, extname } from "path";
import { randomUUID } from "crypto";

const MAX_SIZE = 50 * 1024 * 1024; // 50 MB
const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain", "text/csv",
];

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
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "File type not allowed." }, { status: 400 });
  }

  const uploadDir = process.env.UPLOAD_DIR || "./uploads";
  const subDir = locationId ? `locations/${locationId}` : `assets/${assetId}`;
  const fullDir = join(process.cwd(), uploadDir, subDir);

  await mkdir(fullDir, { recursive: true });

  const ext = extname(file.name);
  const filename = `${randomUUID()}${ext}`;
  const relativePath = `${subDir}/${filename}`;
  const fullPath = join(fullDir, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(fullPath, buffer);

  const attachment = await prisma.attachment.create({
    data: {
      filename,
      originalName: file.name,
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
