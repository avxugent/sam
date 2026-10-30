import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/** The client to read with: the app's, or a transaction's. */
type Db = PrismaClient | Prisma.TransactionClient;

/** Key/value pairs from the AppSetting table; missing keys are absent from the result. */
export async function readSettings(keys: readonly string[], db: Db = prisma): Promise<Record<string, string>> {
  const rows = await db.appSetting.findMany({ where: { key: { in: [...keys] } } });
  return Object.fromEntries(rows.map((s) => [s.key, s.value]));
}

/**
 * Upserts every entry whose value is defined (undefined = "not part of this
 * update") and returns what was written, ready for an audit `detail`.
 */
export async function writeSettings(entries: Record<string, string | undefined>): Promise<Record<string, string>> {
  const written = Object.fromEntries(
    Object.entries(entries).filter((e): e is [string, string] => e[1] !== undefined)
  );
  await Promise.all(
    Object.entries(written).map(([key, value]) =>
      prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } })
    )
  );
  return written;
}

// ── Setting groups ───────────────────────────────────────────────────────────
// Each group owns its keys, defaults and decoding, so every reader (settings
// page, settings API, layouts, auth, asset defaults, compliance report) sees
// the same values. The plain-JS maintenance scripts (purge-audit,
// export-backup) cannot import this module and read their one key directly.

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

/** Writes all three templates; an empty one clears it. */
export function writeGeneralSettings(settings: GeneralSettings): Promise<Record<string, string>> {
  return writeSettings({
    [GENERAL_KEYS.hostnameUrlTemplate]: settings.hostnameUrlTemplate,
    [GENERAL_KEYS.macAddressUrlTemplate]: settings.macAddressUrlTemplate,
    [GENERAL_KEYS.locationUrlTemplate]: settings.locationUrlTemplate,
  });
}

export const BRANDING_KEYS = {
  appTitle: "app.title",
  logo: "branding.logoStorageKey",
  favicon: "branding.faviconStorageKey",
  backgroundMode: "branding.backgroundMode",
  background: "branding.backgroundStorageKey",
} as const;

export type BrandingSettings = {
  /** The configured title, or "SAM" when none (or an empty one) is set. */
  appTitle: string;
  hasLogo: boolean;
  hasFavicon: boolean;
  /** Raw stored mode; "" for the default. Narrow with parseBackgroundMode(). */
  backgroundMode: string;
  hasCustomBackground: boolean;
};

export async function readBrandingSettings(): Promise<BrandingSettings> {
  const map = await readSettings(Object.values(BRANDING_KEYS));
  return {
    appTitle: map[BRANDING_KEYS.appTitle] || "SAM",
    hasLogo: !!map[BRANDING_KEYS.logo],
    hasFavicon: !!map[BRANDING_KEYS.favicon],
    backgroundMode: map[BRANDING_KEYS.backgroundMode] ?? "",
    hasCustomBackground: !!map[BRANDING_KEYS.background],
  };
}

const EXPORT_KEYS = {
  cronExpression: "export.cronExpression",
  outputDir: "export.outputDir",
  enabled: "export.enabled",
} as const;

export type ExportSettings = { cronExpression: string; outputDir: string; enabled: boolean };

export async function readExportSettings(): Promise<ExportSettings> {
  const map = await readSettings(Object.values(EXPORT_KEYS));
  return {
    cronExpression: map[EXPORT_KEYS.cronExpression] ?? "0 2 * * *",
    outputDir: map[EXPORT_KEYS.outputDir] ?? "/backups",
    enabled: map[EXPORT_KEYS.enabled] === "true",
  };
}

/** Writes the fields present in `update` (null stores an empty value); returns what was written. */
export function writeExportSettings(update: { [K in keyof ExportSettings]?: ExportSettings[K] | null }): Promise<Record<string, string>> {
  const entries: Record<string, string | undefined> = {};
  for (const [field, key] of Object.entries(EXPORT_KEYS) as [keyof ExportSettings, string][]) {
    const value = update[field];
    if (value !== undefined) entries[key] = value === null ? "" : String(value);
  }
  return writeSettings(entries);
}
