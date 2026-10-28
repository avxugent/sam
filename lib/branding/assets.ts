import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { getStorageDriver, StorageNotFoundError } from "@/lib/storage";
import { logAudit } from "@/lib/audit";
import { writeSettings } from "@/lib/app-settings";

/**
 * Logo, favicon and background image share one lifecycle: an admin uploads a file,
 * it is stored under a fixed key and two AppSettings (storage key + content type)
 * point at it, and a public route serves it back. Only the limits differ.
 */
type BrandingAssetConfig = {
  label: string;
  storageKey: string;
  defaultContentType: string;
  allowedMimeTypes: string[];
  allowedLabel: string;
  maxBytes: number;
  /** Extra AppSettings set on upload and removed on delete. */
  extraSettings?: Record<string, string>;
};

const MB = 1024 * 1024;

const BRANDING_ASSETS = {
  logo: {
    label: "Logo",
    storageKey: "branding/logo",
    defaultContentType: "image/png",
    allowedMimeTypes: ["image/png", "image/jpeg", "image/svg+xml", "image/webp"],
    allowedLabel: "PNG, JPEG, SVG, WebP",
    maxBytes: 2 * MB,
  },
  favicon: {
    label: "Favicon",
    storageKey: "branding/favicon",
    defaultContentType: "image/x-icon",
    allowedMimeTypes: ["image/x-icon", "image/vnd.microsoft.icon", "image/png", "image/svg+xml"],
    allowedLabel: "ICO, PNG, SVG",
    maxBytes: 1 * MB,
  },
  background: {
    label: "Background image",
    storageKey: "branding/background",
    defaultContentType: "image/png",
    allowedMimeTypes: ["image/png", "image/svg+xml", "image/webp"],
    allowedLabel: "PNG, SVG, WebP",
    maxBytes: 2 * MB,
    extraSettings: { "branding.backgroundMode": "custom" },
  },
} satisfies Record<string, BrandingAssetConfig>;

export type BrandingAsset = keyof typeof BRANDING_ASSETS;

function settingKeys(asset: BrandingAsset) {
  return {
    storageKey: `branding.${asset}StorageKey`,
    contentType: `branding.${asset}ContentType`,
  };
}

/** Public GET: stream the stored file, or 404 when none is configured. */
export async function serveBrandingAsset(asset: BrandingAsset) {
  const keys = settingKeys(asset);
  const [keySetting, typeSetting] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: keys.storageKey } }),
    prisma.appSetting.findUnique({ where: { key: keys.contentType } }),
  ]);

  if (!keySetting?.value) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const data = await getStorageDriver().getObject(keySetting.value);
    const contentType = typeSetting?.value || BRANDING_ASSETS[asset].defaultContentType;
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

/** Admin POST: validate and store the uploaded file. Caller must have checked the role. */
export async function uploadBrandingAsset(req: Request, session: Session, asset: BrandingAsset) {
  const config: BrandingAssetConfig = BRANDING_ASSETS[asset];
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!config.allowedMimeTypes.includes(file.type)) {
    return NextResponse.json(
      { error: `Invalid file type. Allowed: ${config.allowedLabel}` },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > config.maxBytes) {
    return NextResponse.json(
      { error: `File too large. Maximum size is ${config.maxBytes / MB} MB` },
      { status: 400 }
    );
  }

  await getStorageDriver().putObject(config.storageKey, buffer, file.type);

  const keys = settingKeys(asset);
  const settings: Record<string, string> = {
    [keys.storageKey]: config.storageKey,
    [keys.contentType]: file.type,
    ...config.extraSettings,
  };
  await writeSettings(settings);

  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "Setting",
    entityName: "Branding settings",
    detail: { event: `${config.label} uploaded`, contentType: file.type },
  });

  return NextResponse.json({ ok: true });
}

/** Admin DELETE: remove the stored file and its settings. Caller must have checked the role. */
export async function removeBrandingAsset(req: Request, session: Session, asset: BrandingAsset) {
  const config: BrandingAssetConfig = BRANDING_ASSETS[asset];
  await getStorageDriver().deleteObject(config.storageKey);

  const keys = settingKeys(asset);
  const settingKeysToDelete = [keys.storageKey, keys.contentType, ...Object.keys(config.extraSettings ?? {})];
  await Promise.all(
    settingKeysToDelete.map((key) => prisma.appSetting.deleteMany({ where: { key } }))
  );

  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "Setting",
    entityName: "Branding settings",
    detail: { event: `${config.label} removed` },
  });

  return NextResponse.json({ ok: true });
}
