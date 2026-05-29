import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStorageDriver, StorageNotFoundError } from "@/lib/storage";

export async function GET() {
  const [keySetting, typeSetting] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: "branding.backgroundStorageKey" } }),
    prisma.appSetting.findUnique({ where: { key: "branding.backgroundContentType" } }),
  ]);

  if (!keySetting?.value) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const driver = getStorageDriver();
    const data = await driver.getObject(keySetting.value);
    const contentType = typeSetting?.value || "image/png";
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    if (err instanceof StorageNotFoundError) {
      return new NextResponse(null, { status: 404 });
    }
    throw err;
  }
}
