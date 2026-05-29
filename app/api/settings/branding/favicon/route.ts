import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStorageDriver } from "@/lib/storage";
import { logAudit } from "@/lib/audit";

const ALLOWED_MIME_TYPES = new Set([
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "image/png",
  "image/svg+xml",
]);

const MAX_SIZE = 1 * 1024 * 1024; // 1 MB
const STORAGE_KEY = "branding/favicon";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Invalid file type. Allowed: ICO, PNG, SVG" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > MAX_SIZE) {
    return NextResponse.json({ error: "File too large. Maximum size is 1 MB" }, { status: 400 });
  }

  const driver = getStorageDriver();
  await driver.putObject(STORAGE_KEY, buffer, file.type);

  await Promise.all([
    prisma.appSetting.upsert({
      where: { key: "branding.faviconStorageKey" },
      update: { value: STORAGE_KEY },
      create: { key: "branding.faviconStorageKey", value: STORAGE_KEY },
    }),
    prisma.appSetting.upsert({
      where: { key: "branding.faviconContentType" },
      update: { value: file.type },
      create: { key: "branding.faviconContentType", value: file.type },
    }),
  ]);

  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "Setting",
    entityName: "Branding settings",
    detail: { event: "Favicon uploaded", contentType: file.type },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const driver = getStorageDriver();
  await driver.deleteObject(STORAGE_KEY);

  await Promise.all([
    prisma.appSetting.deleteMany({ where: { key: "branding.faviconStorageKey" } }),
    prisma.appSetting.deleteMany({ where: { key: "branding.faviconContentType" } }),
  ]);

  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "Setting",
    entityName: "Branding settings",
    detail: { event: "Favicon removed" },
  });

  return NextResponse.json({ ok: true });
}
