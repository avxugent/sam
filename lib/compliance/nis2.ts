/**
 * NIS2 compliance dashboard aggregations. Each stat carries a small sample so
 * the dashboard can show what needs fixing without a follow-up query.
 */
import { prisma } from "@/lib/prisma";
import { readComplianceSetting, readComplianceSettings } from "@/lib/app-settings";
import { runLocationReport } from "@/lib/reports/engine";
import { isSyslogConfigured } from "@/lib/audit/syslog";
import type { Prisma } from "@/generated/prisma/client";

const SAMPLE_SIZE = 50;

/**
 * Local (credentials) users with no second factor: neither TOTP nor a
 * passkey. A passkey counts, as it does at sign-in (lib/auth.ts needs2FA).
 */
const WITHOUT_SECOND_FACTOR_WHERE: Prisma.UserWhereInput = {
  provider: "credentials",
  totpEnabled: false,
  passkeys: { none: {} },
};

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
};

export type Nis2Counts = {
  assetsMissingOwner: number;
  assetsMissingCriticality: number;
  assetsPastEndOfSupport: number;
  assetsWithoutEndOfSupportDate: number;
  locationsMissingReview: number | null; // null = review item not configured
  usersWithout2fa: number;
  auditBacklog: number;
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
  model: { select: { name: true } },
  serialNumber: true,
  hostname: true,
} as const;

async function assetStat(where: Prisma.AssetWhereInput): Promise<{ count: number; sample: AssetSample[] }> {
  const [count, rows] = await Promise.all([
    prisma.asset.count({ where }),
    prisma.asset.findMany({ where, select: ASSET_SAMPLE_SELECT, take: SAMPLE_SIZE, orderBy: { createdAt: "desc" } }),
  ]);
  const sample = rows.map((r) => ({ ...r, model: r.model?.name ?? null }));
  return { count, sample };
}

async function locationsMissingReview(): Promise<Nis2ComplianceResult["locationsMissingReview"]> {
  const { reviewWorkLogItemId: itemId, reviewPeriodMonths: periodMonths } = await readComplianceSettings();
  if (!itemId) return { configured: false };

  const item = await prisma.workLogItem.findUnique({ where: { id: itemId }, select: { name: true } });
  if (!item) return { configured: false };


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
    requireTwoFactor,
    backlog,
  ] = await Promise.all([
      assetStat({ status: "INSTALLED", ownerId: null }),
      assetStat(UNCLASSIFIED_WHERE),
      assetStat({ status: "INSTALLED", endOfSupportDate: { lt: today } }),
      prisma.asset.count({ where: { status: "INSTALLED", endOfSupportDate: null } }),
      locationsMissingReview(),
      prisma.user.count({ where: WITHOUT_SECOND_FACTOR_WHERE }),
      readComplianceSetting("requireTwoFactor"),
      prisma.auditLog.count({ where: { forwardedAt: null } }),
    ]);

  return {
    assetsMissingOwner: missingOwner,
    assetsMissingCriticality: missingCriticality,
    assetsPastEndOfSupport: { ...pastEos, withoutDate: withoutEosDate },
    locationsMissingReview: review,
    usersWithout2fa: { count: usersNo2fa, globallyRequired: requireTwoFactor },
    auditBacklog: { count: backlog, syslogConfigured: isSyslogConfigured() },
  };
}

/** Counts-only variant for the Prometheus metrics endpoint. */
export async function computeNis2Counts(): Promise<Nis2Counts> {
  const today = new Date();

  const [missingOwner, missingCriticality, pastEos, withoutEosDate, usersNo2fa, backlog, reviewItemId] =
    await Promise.all([
      prisma.asset.count({ where: { status: "INSTALLED", ownerId: null } }),
      prisma.asset.count({ where: UNCLASSIFIED_WHERE }),
      prisma.asset.count({ where: { status: "INSTALLED", endOfSupportDate: { lt: today } } }),
      prisma.asset.count({ where: { status: "INSTALLED", endOfSupportDate: null } }),
      prisma.user.count({ where: WITHOUT_SECOND_FACTOR_WHERE }),
      prisma.auditLog.count({ where: { forwardedAt: null } }),
      readComplianceSetting("reviewWorkLogItemId"),
    ]);

  let reviewCount: number | null = null;
  if (reviewItemId) {
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
  };
}
