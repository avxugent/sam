import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStorageDriver } from "@/lib/storage";
import { logAudit } from "@/lib/audit";
import { isAdmin } from "@/lib/permissions";

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/svg+xml",
  "image/webp",
]);

const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
const STORAGE_KEY = "branding/background";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Invalid file type. Allowed: PNG, SVG, WebP" },
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
      where: { key: "branding.backgroundStorageKey" },
      update: { value: STORAGE_KEY },
      create: { key: "branding.backgroundStorageKey", value: STORAGE_KEY },
    }),
    prisma.appSetting.upsert({
      where: { key: "branding.backgroundContentType" },
      update: { value: file.type },
      create: { key: "branding.backgroundContentType", value: file.type },
    }),
    prisma.appSetting.upsert({
      where: { key: "branding.backgroundMode" },
      update: { value: "custom" },
      create: { key: "branding.backgroundMode", value: "custom" },
    }),
  ]);

  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "Setting",
    entityName: "Branding settings",
    detail: { event: "Background image uploaded", contentType: file.type },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const driver = getStorageDriver();
  await driver.deleteObject(STORAGE_KEY);

  await Promise.all([
    prisma.appSetting.deleteMany({ where: { key: "branding.backgroundStorageKey" } }),
    prisma.appSetting.deleteMany({ where: { key: "branding.backgroundContentType" } }),
    prisma.appSetting.deleteMany({ where: { key: "branding.backgroundMode" } }),
  ]);

  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "Setting",
    entityName: "Branding settings",
    detail: { event: "Background image removed" },
  });

  return NextResponse.json({ ok: true });
}
