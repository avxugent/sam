"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { Nis2ComplianceResult, AssetSample, LocationSample } from "@/lib/nis2-compliance";

type CardKey =
  | "missingOwner"
  | "missingCriticality"
  | "pastEndOfSupport"
  | "missingReview"
  | "usersWithout2fa"
  | "auditBacklog"
  | "firmwareOutdated"
  | "firmwareStale"
  | "firmwareUnmeasured";

function countColor(count: number): string {
  return count === 0 ? "text-[#16a34a]" : "text-[#dc2626]";
}

function StatCard({
  title,
  subtitle,
  count,
  expandable,
  expanded,
  onToggle,
  href,
  linkLabel,
}: {
  title: string;
  subtitle: string;
  count: number | string;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="rounded-[10px] border border-[#e2e8f0] bg-white p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-[#64748b]">{title}</p>
          <p
            className={cn(
              "text-[28px] font-bold tracking-[-0.01em]",
              typeof count === "number" ? countColor(count) : "text-[#64748b]"
            )}
          >
            {count}
          </p>
          <p className="text-[12px] text-[#64748b] mt-0.5">{subtitle}</p>
        </div>
        {expandable && (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="p-1 rounded hover:bg-[#f1f5f9] text-[#64748b] flex-shrink-0"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        )}
      </div>
      {href && linkLabel && (
        <Link href={href} className="text-[12px] text-[#1e64c8] hover:underline mt-2 inline-block">
          {linkLabel}
        </Link>
      )}
    </div>
  );
}

function AssetSampleList({ sample, total }: { sample: AssetSample[]; total: number }) {
  const t = useTranslations("compliance");
  return (
    <div className="rounded-[10px] border border-[#e2e8f0] bg-white p-4 text-[13px]">
      <ul className="space-y-1">
        {sample.map((a) => (
          <li key={a.id}>
            <Link
              href={`/locations/${a.locationId}/assets/${a.id}`}
              className="text-[#1e64c8] hover:underline"
            >
              {a.model ?? a.serialNumber ?? a.hostname ?? a.id}
            </Link>
            {a.hostname && a.model && (
              <span className="text-[#64748b] ml-1.5 font-mono text-[11.5px]">{a.hostname}</span>
            )}
          </li>
        ))}
      </ul>
      {total > sample.length && (
        <p className="text-[12px] text-[#64748b] mt-2">
          {t("nis2SampleMore", { shown: sample.length, total })}
        </p>
      )}
    </div>
  );
}

function LocationSampleList({ sample, total }: { sample: LocationSample[]; total: number }) {
  const t = useTranslations("compliance");
  return (
    <div className="rounded-[10px] border border-[#e2e8f0] bg-white p-4 text-[13px]">
      <ul className="space-y-1">
        {sample.map((l) => (
          <li key={l.id}>
            <Link href={`/locations/${l.id}`} className="text-[#1e64c8] hover:underline">
              {l.path}
            </Link>
          </li>
        ))}
      </ul>
      {total > sample.length && (
        <p className="text-[12px] text-[#64748b] mt-2">
          {t("nis2SampleMore", { shown: sample.length, total })}
        </p>
      )}
    </div>
  );
}

export function Nis2DashboardClient({ result }: { result: Nis2ComplianceResult }) {
  const t = useTranslations("compliance");
  const [expanded, setExpanded] = useState<CardKey | null>(null);

  function toggle(key: CardKey) {
    setExpanded((prev) => (prev === key ? null : key));
  }

  const review = result.locationsMissingReview;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[16px] font-bold text-[#0f172a]">{t("nis2Title")}</h2>
        <p className="text-[12.5px] text-[#64748b]">{t("nis2Subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          title={t("nis2MissingOwner")}
          subtitle={t("nis2MissingOwnerHelp")}
          count={result.assetsMissingOwner.count}
          expandable={result.assetsMissingOwner.count > 0}
          expanded={expanded === "missingOwner"}
          onToggle={() => toggle("missingOwner")}
        />
        <StatCard
          title={t("nis2MissingCriticality")}
          subtitle={t("nis2MissingCriticalityHelp")}
          count={result.assetsMissingCriticality.count}
          expandable={result.assetsMissingCriticality.count > 0}
          expanded={expanded === "missingCriticality"}
          onToggle={() => toggle("missingCriticality")}
        />
        <StatCard
          title={t("nis2PastEos")}
          subtitle={t("nis2PastEosHelp", { withoutDate: result.assetsPastEndOfSupport.withoutDate })}
          count={result.assetsPastEndOfSupport.count}
          expandable={result.assetsPastEndOfSupport.count > 0}
          expanded={expanded === "pastEndOfSupport"}
          onToggle={() => toggle("pastEndOfSupport")}
        />
        {review.configured ? (
          <StatCard
            title={t("nis2MissingReview")}
            subtitle={t("nis2MissingReviewHelp", {
              item: review.itemName ?? "",
              months: review.periodMonths,
              total: review.totalLeaves,
            })}
            count={review.count}
            expandable={review.count > 0}
            expanded={expanded === "missingReview"}
            onToggle={() => toggle("missingReview")}
          />
        ) : (
          <StatCard
            title={t("nis2MissingReview")}
            subtitle={t("nis2ReviewNotConfigured")}
            count="—"
            href="/admin/settings"
            linkLabel={t("nis2ConfigureLink")}
          />
        )}
        <StatCard
          title={t("nis2UsersWithout2fa")}
          subtitle={
            result.usersWithout2fa.globallyRequired
              ? t("nis2UsersWithout2faForced")
              : t("nis2UsersWithout2faHelp")
          }
          count={result.usersWithout2fa.count}
          href="/admin/users"
          linkLabel={t("nis2ManageUsersLink")}
        />
        <StatCard
          title={t("nis2FirmwareOutdated")}
          subtitle={t("nis2FirmwareOutdatedHelp")}
          count={result.firmware.outdated.count}
          expandable={result.firmware.outdated.count > 0}
          expanded={expanded === "firmwareOutdated"}
          onToggle={() => toggle("firmwareOutdated")}
        />
        <StatCard
          title={t("nis2FirmwareStale")}
          subtitle={t("nis2FirmwareStaleHelp", { days: result.firmware.maxAgeDays })}
          count={result.firmware.stale.count}
          expandable={result.firmware.stale.count > 0}
          expanded={expanded === "firmwareStale"}
          onToggle={() => toggle("firmwareStale")}
        />
        <StatCard
          title={t("nis2FirmwareUnmeasured")}
          // The coverage figure belongs in the same card as the count. Read
          // alone, "12 unmeasured" sounds small; "12 unmeasured, 30% of the
          // fleet measurable at all" is the honest version.
          subtitle={t("nis2FirmwareUnmeasuredHelp", {
            coverage:
              result.firmware.measuredCoverage === null
                ? "—"
                : `${Math.round(result.firmware.measuredCoverage * 100)}%`,
          })}
          count={result.firmware.unmeasured.count}
          expandable={result.firmware.unmeasured.count > 0}
          expanded={expanded === "firmwareUnmeasured"}
          onToggle={() => toggle("firmwareUnmeasured")}
          href="/admin/firmware-baselines"
          linkLabel={t("nis2FirmwareBaselinesLink")}
        />
        <StatCard
          title={t("nis2AuditBacklog")}
          subtitle={
            result.auditBacklog.syslogConfigured
              ? t("nis2AuditBacklogHelp")
              : t("nis2AuditBacklogNoSyslog")
          }
          count={result.auditBacklog.count}
          href="/admin/audit"
          linkLabel={t("nis2ViewAuditLink")}
        />
      </div>

      {expanded === "firmwareOutdated" && (
        <AssetSampleList
          sample={result.firmware.outdated.sample}
          total={result.firmware.outdated.count}
        />
      )}
      {expanded === "firmwareStale" && (
        <AssetSampleList sample={result.firmware.stale.sample} total={result.firmware.stale.count} />
      )}
      {expanded === "firmwareUnmeasured" && (
        <AssetSampleList
          sample={result.firmware.unmeasured.sample}
          total={result.firmware.unmeasured.count}
        />
      )}
      {expanded === "missingOwner" && (
        <AssetSampleList sample={result.assetsMissingOwner.sample} total={result.assetsMissingOwner.count} />
      )}
      {expanded === "missingCriticality" && (
        <AssetSampleList sample={result.assetsMissingCriticality.sample} total={result.assetsMissingCriticality.count} />
      )}
      {expanded === "pastEndOfSupport" && (
        <AssetSampleList sample={result.assetsPastEndOfSupport.sample} total={result.assetsPastEndOfSupport.count} />
      )}
      {expanded === "missingReview" && review.configured && (
        <LocationSampleList sample={review.sample} total={review.count} />
      )}
    </div>
  );
}
