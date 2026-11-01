import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { parseBackgroundMode, type BackgroundMode } from "@/lib/branding/background-mode";

/** The client to read with: the app's, or a transaction's. */
type Db = PrismaClient | Prisma.TransactionClient;

/** Key/value pairs from the AppSetting table; missing keys are absent from the result. */
export async function readSettings(keys: readonly string[], db: Db = prisma): Promise<Record<string, string>> {
  const rows = await db.appSetting.findMany({ where: { key: { in: [...keys] } } });
  return Object.fromEntries(rows.map((s) => [s.key, s.value]));
}

/**
 * Upserts every entry whose value is defined (undefined = "not part of this
 * update") in one transaction, so a group is never half-written, and returns
 * what was written, ready for an audit `detail`.
 */
export async function writeSettings(entries: Record<string, string | undefined>): Promise<Record<string, string>> {
  const written = Object.fromEntries(
    Object.entries(entries).filter((e): e is [string, string] => e[1] !== undefined)
  );
  await prisma.$transaction(
    Object.entries(written).map(([key, value]) =>
      prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } })
    )
  );
  return written;
}

/** Removes the given settings (absent keys are ignored). */
export async function deleteSettings(keys: readonly string[]): Promise<void> {
  await prisma.appSetting.deleteMany({ where: { key: { in: [...keys] } } });
}

// ── Setting groups ───────────────────────────────────────────────────────────
// Each group owns its keys, defaults and decoding, so every reader (settings
// page, settings API, layouts, auth, asset defaults, compliance report) sees
// the same values, including the maintenance scripts (purge-audit,
// export-backup).

function intSetting(value: string | undefined, fallback: number): number {
  const n = parseInt(value ?? "", 10);
  return Number.isNaN(n) ? fallback : n;
}

const COMPLIANCE_KEYS = {
  requireTwoFactor: "security.requireTwoFactor",
  auditRetentionDays: "audit.retentionDays",
  defaultOwnerId: "assets.defaultOwnerId",
  reviewWorkLogItemId: "compliance.reviewWorkLogItemId",
  reviewPeriodMonths: "compliance.reviewPeriodMonths",
} as const;

export type ComplianceSettings = {
  requireTwoFactor: boolean;
  auditRetentionDays: number;
  defaultOwnerId: string | null;
  reviewWorkLogItemId: string | null;
  reviewPeriodMonths: number;
};

const COMPLIANCE_DECODE: { [K in keyof ComplianceSettings]: (value: string | undefined) => ComplianceSettings[K] } = {
  requireTwoFactor: (v) => v === "true",
  auditRetentionDays: (v) => intSetting(v, 730),
  defaultOwnerId: (v) => v || null,
  reviewWorkLogItemId: (v) => v || null,
  reviewPeriodMonths: (v) => intSetting(v, 12),
};

export async function readComplianceSettings(db: Db = prisma): Promise<ComplianceSettings> {
  const map = await readSettings(Object.values(COMPLIANCE_KEYS), db);
  const settings = {} as Record<keyof ComplianceSettings, unknown>;
  for (const field of Object.keys(COMPLIANCE_KEYS) as (keyof ComplianceSettings)[]) {
    settings[field] = COMPLIANCE_DECODE[field](map[COMPLIANCE_KEYS[field]]);
  }
  return settings as ComplianceSettings;
}

/** One compliance setting, decoded like readComplianceSettings() does, in a single query. */
export async function readComplianceSetting<K extends keyof ComplianceSettings>(
  field: K,
  db: Db = prisma
): Promise<ComplianceSettings[K]> {
  const row = await db.appSetting.findUnique({ where: { key: COMPLIANCE_KEYS[field] }, select: { value: true } });
  return COMPLIANCE_DECODE[field](row?.value);
}

/** Writes the fields present in `update` (null clears an id); returns what was written. */
export function writeComplianceSettings(update: Partial<ComplianceSettings>): Promise<Record<string, string>> {
  const entries: Record<string, string | undefined> = {};
  for (const [field, key] of Object.entries(COMPLIANCE_KEYS) as [keyof ComplianceSettings, string][]) {
    const value = update[field];
    if (value !== undefined) entries[key] = value === null ? "" : String(value);
  }
  return writeSettings(entries);
}

const GENERAL_KEYS = {
  hostnameUrlTemplate: "hostname.urlTemplate",
  macAddressUrlTemplate: "macAddress.urlTemplate",
  locationUrlTemplate: "location.urlTemplate",
} as const;

/** Link templates; "" when not configured. */
export type GeneralSettings = Record<keyof typeof GENERAL_KEYS, string>;

export async function readGeneralSettings(): Promise<GeneralSettings> {
  const map = await readSettings(Object.values(GENERAL_KEYS));
  return {
    hostnameUrlTemplate: map[GENERAL_KEYS.hostnameUrlTemplate] ?? "",
    macAddressUrlTemplate: map[GENERAL_KEYS.macAddressUrlTemplate] ?? "",
    locationUrlTemplate: map[GENERAL_KEYS.locationUrlTemplate] ?? "",
  };
}

/** Writes the templates present in `update` (null or "" clears one); returns what was written. */
export function writeGeneralSettings(update: { [K in keyof GeneralSettings]?: string | null }): Promise<Record<string, string>> {
  const entries: Record<string, string | undefined> = {};
  for (const [field, key] of Object.entries(GENERAL_KEYS) as [keyof GeneralSettings, string][]) {
    const value = update[field];
    if (value !== undefined) entries[key] = value ?? "";
  }
  return writeSettings(entries);
}

/** Where each uploaded branding file is recorded: its storage key and content type. */
export const BRANDING_FILE_KEYS = {
  logo: { storageKey: "branding.logoStorageKey", contentType: "branding.logoContentType" },
  favicon: { storageKey: "branding.faviconStorageKey", contentType: "branding.faviconContentType" },
  background: { storageKey: "branding.backgroundStorageKey", contentType: "branding.backgroundContentType" },
} as const;

export const BRANDING_KEYS = {
  appTitle: "app.title",
  logo: BRANDING_FILE_KEYS.logo.storageKey,
  favicon: BRANDING_FILE_KEYS.favicon.storageKey,
  backgroundMode: "branding.backgroundMode",
  background: BRANDING_FILE_KEYS.background.storageKey,
} as const;

export type BrandingSettings = {
  /** The configured title, or "SAM" when none (or an empty one) is set. */
  appTitle: string;
  hasLogo: boolean;
  hasFavicon: boolean;
  /** "" for the default; an unknown stored value reads as the default too. */
  backgroundMode: BackgroundMode;
  hasCustomBackground: boolean;
};

export async function readBrandingSettings(): Promise<BrandingSettings> {
  const map = await readSettings(Object.values(BRANDING_KEYS));
  return {
    appTitle: map[BRANDING_KEYS.appTitle] || "SAM",
    hasLogo: !!map[BRANDING_KEYS.logo],
    hasFavicon: !!map[BRANDING_KEYS.favicon],
    backgroundMode: parseBackgroundMode(map[BRANDING_KEYS.backgroundMode]),
    hasCustomBackground: !!map[BRANDING_KEYS.background],
  };
}

/**
 * Writes the fields present in `update`; a background mode of "" (the default)
 * removes the stored setting. Returns what was written, ready for an audit
 * `detail` (a removed mode is recorded as "(none)").
 */
export async function writeBrandingSettings(update: {
  appTitle?: string;
  backgroundMode?: BackgroundMode;
}): Promise<Record<string, string>> {
  const { appTitle, backgroundMode } = update;
  const [written] = await Promise.all([
    writeSettings({ [BRANDING_KEYS.appTitle]: appTitle, [BRANDING_KEYS.backgroundMode]: backgroundMode || undefined }),
    backgroundMode === "" ? deleteSettings([BRANDING_KEYS.backgroundMode]) : null,
  ]);
  return backgroundMode === "" ? { ...written, [BRANDING_KEYS.backgroundMode]: "(none)" } : written;
}

const EXPORT_KEYS = {
  cronExpression: "export.cronExpression",
  outputDir: "export.outputDir",
  enabled: "export.enabled",
} as const;

export type ExportSettings = { cronExpression: string; outputDir: string; enabled: boolean };

// An empty stored schedule or directory (a cleared field) means the default.

export async function readExportSettings(): Promise<ExportSettings> {
  const map = await readSettings(Object.values(EXPORT_KEYS));
  return {
    cronExpression: map[EXPORT_KEYS.cronExpression] || "0 2 * * *",
    outputDir: map[EXPORT_KEYS.outputDir] || "/backups",
    enabled: map[EXPORT_KEYS.enabled] === "true",
  };
}

/** Writes the fields present in `update` (null stores an empty value, read back as the default); returns what was written. */
export function writeExportSettings(update: { [K in keyof ExportSettings]?: ExportSettings[K] | null }): Promise<Record<string, string>> {
  const entries: Record<string, string | undefined> = {};
  for (const [field, key] of Object.entries(EXPORT_KEYS) as [keyof ExportSettings, string][]) {
    const value = update[field];
    if (value !== undefined) entries[key] = value === null ? "" : String(value);
  }
  return writeSettings(entries);
}
