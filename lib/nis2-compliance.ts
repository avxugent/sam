/**
 * NIS2 compliance dashboard aggregations. Each stat carries a small sample so
 * the dashboard can show what needs fixing without a follow-up query.
 */
import { prisma } from "@/lib/prisma";
import { runLocationReport } from "@/lib/report-engine";
import { isSyslogConfigured } from "@/lib/syslog";
import {
  firmwareStatus,
  matchBaseline,
  DEFAULT_FIRMWARE_MAX_AGE_DAYS,
  type Baseline,
  type FirmwareStatus,
} from "@/lib/firmware";
import type { Prisma } from "@/generated/prisma/client";

const SAMPLE_SIZE = 50;

export type AssetSample = {
  id: string;
  locationId: string;
  model: string | null;
  serialNumber: string | null;
  hostname: string | null;
};

export type LocationSample = {
  id: string;
  name: string;
  path: string;
};

export type Nis2ComplianceResult = {
  assetsMissingOwner: { count: number; sample: AssetSample[] };
  assetsMissingCriticality: { count: number; sample: AssetSample[] };
  assetsPastEndOfSupport: { count: number; sample: AssetSample[]; withoutDate: number };
  locationsMissingReview:
    | { configured: false }
    | { configured: true; count: number; totalLeaves: number; sample: LocationSample[]; periodMonths: number; itemName: string | null };
  usersWithout2fa: { count: number; globallyRequired: boolean };
  auditBacklog: { count: number; syslogConfigured: boolean };
  firmware: FirmwareCompliance;
};

export type FirmwareCounts = Record<FirmwareStatus, number>;

/**
 * Classifies every monitored asset against its firmware baseline.
 *
 * Shared by the metrics endpoint and the compliance dashboard so they cannot
 * disagree. "unclassified" (no baseline) and "no_data" (device has no API, or
 * has not answered) are counted apart from "compliant" — reporting either as
 * compliant would overstate NIS2 coverage.
 */
export type FirmwareAssetStatus = AssetSample & {
  hostname: string;
  version: string | null;
  source: string | null;
  status: FirmwareStatus;
};

export async function computeFirmwareStatuses(): Promise<FirmwareAssetStatus[]> {
  const [assets, baselineRows, maxAgeSetting] = await Promise.all([
    prisma.asset.findMany({
      where: {
        status: "INSTALLED",
        hostname: { not: null },
        OR: [{ typeId: null }, { type: { prometheusExposed: true } }],
      },
      select: {
        id: true,
        locationId: true,
        serialNumber: true,
        hostname: true,
        typeId: true,
        model: true,
        firmwareVersion: true,
        firmwareCheckedAt: true,
        firmwareSource: true,
      },
    }),
    prisma.firmwareBaseline.findMany({
      select: { typeId: true, model: true, approvedVersion: true },
    }),
    prisma.appSetting.findUnique({ where: { key: "compliance.firmwareMaxAgeDays" } }),
  ]);

  const baselines: Baseline[] = baselineRows;
  const maxAgeDays =
    parseInt(maxAgeSetting?.value ?? "", 10) || DEFAULT_FIRMWARE_MAX_AGE_DAYS;
  // One "now" for the whole batch, so two assets checked at the same moment
  // cannot land on opposite sides of the staleness boundary.
  const now = new Date();

  return assets.map((a) => ({
    id: a.id,
    locationId: a.locationId,
    model: a.model,
    serialNumber: a.serialNumber,
    hostname: a.hostname!,
    version: a.firmwareVersion,
    source: a.firmwareSource,
    status: firmwareStatus(a.firmwareVersion, matchBaseline(baselines, a.typeId, a.model), {
      checkedAt: a.firmwareCheckedAt,
      maxAgeDays,
      now,
    }),
  }));
}

/** Firmware section of the compliance dashboard, with samples to act on. */
export type FirmwareCompliance = {
  counts: FirmwareCounts;
  outdated: { count: number; sample: AssetSample[] };
  stale: { count: number; sample: AssetSample[] };
  /** unclassified + no_data + unknown — assets whose currency cannot be judged. */
  unmeasured: { count: number; sample: AssetSample[] };
  /**
   * Share of monitored assets whose currency can be judged at all. Null when
   * nothing is monitored. Every other figure here should be read against it:
   * devices with no API can never report a version, so a high "up to date"
   * count over a small measured population is not the reassurance it looks like.
   */
  measuredCoverage: number | null;
  maxAgeDays: number;
};

function toSample(rows: FirmwareAssetStatus[]): AssetSample[] {
  return rows.slice(0, SAMPLE_SIZE).map((r) => ({
    id: r.id,
    locationId: r.locationId,
    model: r.model,
    serialNumber: r.serialNumber,
    hostname: r.hostname,
  }));
}

export async function computeFirmwareCompliance(): Promise<FirmwareCompliance> {
  const [statuses, maxAgeSetting] = await Promise.all([
    computeFirmwareStatuses(),
    prisma.appSetting.findUnique({ where: { key: "compliance.firmwareMaxAgeDays" } }),
  ]);

  const counts = tallyFirmware(statuses);
  const outdated = statuses.filter((s) => s.status === "outdated");
  const stale = statuses.filter((s) => s.status === "stale");
  const unmeasured = statuses.filter(
    (s) => s.status === "unclassified" || s.status === "no_data" || s.status === "unknown"
  );

  const total = statuses.length;
  const measured = counts.compliant + counts.outdated + counts.stale;

  return {
    counts,
    outdated: { count: outdated.length, sample: toSample(outdated) },
    stale: { count: stale.length, sample: toSample(stale) },
    unmeasured: { count: unmeasured.length, sample: toSample(unmeasured) },
    measuredCoverage: total === 0 ? null : measured / total,
    maxAgeDays: parseInt(maxAgeSetting?.value ?? "", 10) || DEFAULT_FIRMWARE_MAX_AGE_DAYS,
  };
}

export function tallyFirmware(
  statuses: Array<{ status: FirmwareStatus }>
): FirmwareCounts {
  const counts: FirmwareCounts = {
    compliant: 0,
    outdated: 0,
    stale: 0,
    unknown: 0,
    unclassified: 0,
    no_data: 0,
  };
  for (const s of statuses) counts[s.status]++;
  return counts;
}

export type Nis2Counts = {
  assetsMissingOwner: number;
  assetsMissingCriticality: number;
  assetsPastEndOfSupport: number;
  assetsWithoutEndOfSupportDate: number;
  locationsMissingReview: number | null; // null = review item not configured
  usersWithout2fa: number;
  auditBacklog: number;
  firmware: FirmwareCounts;
};

// Effective criticality unclassified: no override AND no (or defaultless) type
const UNCLASSIFIED_WHERE: Prisma.AssetWhereInput = {
  status: "INSTALLED",
  criticality: null,
  OR: [{ typeId: null }, { type: { defaultCriticality: null } }],
};

const ASSET_SAMPLE_SELECT = {
  id: true,
  locationId: true,
  model: true,
  serialNumber: true,
  hostname: true,
} as const;

async function assetStat(where: Prisma.AssetWhereInput): Promise<{ count: number; sample: AssetSample[] }> {
  const [count, sample] = await Promise.all([
    prisma.asset.count({ where }),
    prisma.asset.findMany({ where, select: ASSET_SAMPLE_SELECT, take: SAMPLE_SIZE, orderBy: { createdAt: "desc" } }),
  ]);
  return { count, sample };
}

async function locationsMissingReview(): Promise<Nis2ComplianceResult["locationsMissingReview"]> {
  const settings = await prisma.appSetting.findMany({
    where: { key: { in: ["compliance.reviewWorkLogItemId", "compliance.reviewPeriodMonths"] } },
  });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const itemId = map["compliance.reviewWorkLogItemId"];
  if (!itemId) return { configured: false };

  const item = await prisma.workLogItem.findUnique({ where: { id: itemId }, select: { name: true } });
  if (!item) return { configured: false };

  const periodMonths = parseInt(map["compliance.reviewPeriodMonths"] ?? "12", 10) || 12;

  const report = await runLocationReport({
    source: "location",
    itemIds: [itemId],
    status: "notFilled",
    periodCount: periodMonths,
    periodUnit: "months",
  });

  return {
    configured: true,
    count: report.notFilledCount,
    totalLeaves: report.notFilledCount + report.filledCount,
    sample: report.rows.slice(0, SAMPLE_SIZE).map((r) => ({ id: r.id, name: r.name, path: r.path })),
    periodMonths,
    itemName: item.name,
  };
}

export async function computeNis2Compliance(): Promise<Nis2ComplianceResult> {
  const today = new Date();

  const [
    missingOwner,
    missingCriticality,
    pastEos,
    withoutEosDate,
    review,
    usersNo2fa,
    requireSetting,
    backlog,
    firmware,
  ] = await Promise.all([
      assetStat({ status: "INSTALLED", ownerId: null }),
      assetStat(UNCLASSIFIED_WHERE),
      assetStat({ status: "INSTALLED", endOfSupportDate: { lt: today } }),
      prisma.asset.count({ where: { status: "INSTALLED", endOfSupportDate: null } }),
      locationsMissingReview(),
      prisma.user.count({ where: { provider: "credentials", totpEnabled: false } }),
      prisma.appSetting.findUnique({ where: { key: "security.requireTwoFactor" } }),
      prisma.auditLog.count({ where: { forwardedAt: null } }),
      computeFirmwareCompliance(),
    ]);

  return {
    assetsMissingOwner: missingOwner,
    assetsMissingCriticality: missingCriticality,
    assetsPastEndOfSupport: { ...pastEos, withoutDate: withoutEosDate },
    locationsMissingReview: review,
    usersWithout2fa: { count: usersNo2fa, globallyRequired: requireSetting?.value === "true" },
    auditBacklog: { count: backlog, syslogConfigured: isSyslogConfigured() },
    firmware,
  };
}

/** Counts-only variant for the Prometheus metrics endpoint. */
export async function computeNis2Counts(): Promise<Nis2Counts> {
  const today = new Date();

  const [missingOwner, missingCriticality, pastEos, withoutEosDate, usersNo2fa, backlog, reviewItemSetting] =
    await Promise.all([
      prisma.asset.count({ where: { status: "INSTALLED", ownerId: null } }),
      prisma.asset.count({ where: UNCLASSIFIED_WHERE }),
      prisma.asset.count({ where: { status: "INSTALLED", endOfSupportDate: { lt: today } } }),
      prisma.asset.count({ where: { status: "INSTALLED", endOfSupportDate: null } }),
      prisma.user.count({ where: { provider: "credentials", totpEnabled: false } }),
      prisma.auditLog.count({ where: { forwardedAt: null } }),
      prisma.appSetting.findUnique({ where: { key: "compliance.reviewWorkLogItemId" } }),
    ]);

  let reviewCount: number | null = null;
  if (reviewItemSetting?.value) {
    const review = await locationsMissingReview();
    reviewCount = review.configured ? review.count : null;
  }

  return {
    assetsMissingOwner: missingOwner,
    assetsMissingCriticality: missingCriticality,
    assetsPastEndOfSupport: pastEos,
    assetsWithoutEndOfSupportDate: withoutEosDate,
    locationsMissingReview: reviewCount,
    usersWithout2fa: usersNo2fa,
    auditBacklog: backlog,
    firmware: tallyFirmware(await computeFirmwareStatuses()),
  };
}
