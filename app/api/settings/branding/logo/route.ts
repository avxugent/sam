import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStorageDriver } from "@/lib/storage";

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/svg+xml",
  "image/webp",
]);

const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
const STORAGE_KEY = "branding/logo";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Invalid file type. Allowed: PNG, JPEG, SVG, WebP" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > MAX_SIZE) {
    return NextResponse.json({ error: "File too large. Maximum size is 2 MB" }, { status: 400 });
  }

  const driver = getStorageDriver();
  await driver.putObject(STORAGE_KEY, buffer, file.type);

  await Promise.all([
    prisma.appSetting.upsert({
      where: { key: "branding.logoStorageKey" },
      update: { value: STORAGE_KEY },
      create: { key: "branding.logoStorageKey", value: STORAGE_KEY },
    }),
    prisma.appSetting.upsert({
      where: { key: "branding.logoContentType" },
      update: { value: file.type },
      create: { key: "branding.logoContentType", value: file.type },
    }),
  ]);

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const driver = getStorageDriver();
  await driver.deleteObject(STORAGE_KEY);

  await Promise.all([
    prisma.appSetting.deleteMany({ where: { key: "branding.logoStorageKey" } }),
    prisma.appSetting.deleteMany({ where: { key: "branding.logoContentType" } }),
  ]);

  return NextResponse.json({ ok: true });
}
