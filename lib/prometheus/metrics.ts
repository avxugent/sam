/**
 * SAM inventory in Prometheus text exposition format
 * (https://prometheus.io/docs/instrumenting/exposition_formats/), served by
 * /api/prometheus/metrics.
 *
 * No external prom-client dependency — the format is simple enough to
 * produce as a string. All values are gauges (point-in-time counts).
 */

import { prisma } from "@/lib/prisma";
import { ancestorChain, findFiNumber, parseFiNumber } from "@/lib/locations/tree";
import { MONITORED_ASSET_WHERE, samAssetLabels, samLocationLabels } from "@/lib/prometheus/labels";
import { computeNis2Counts } from "@/lib/compliance/nis2";
import { effectiveCriticality } from "@/lib/criticality";

// ─── Text format helpers ─────────────────────────────────────────────────────

type Sample = { labels?: Record<string, string>; value: number };

/** Escape label values per the Prometheus text format spec */
function escapeLabelValue(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function gauge(name: string, help: string, samples: Sample[]): string {
  const lines: string[] = [
    `# HELP ${name} ${help}`,
    `# TYPE ${name} gauge`,
  ];
  for (const s of samples) {
    if (s.labels && Object.keys(s.labels).length > 0) {
      const labelStr = Object.entries(s.labels)
        .map(([k, v]) => `${k}="${escapeLabelValue(v)}"`)
        .join(",");
      lines.push(`${name}{${labelStr}} ${s.value}`);
    } else {
      lines.push(`${name} ${s.value}`);
    }
  }
  return lines.join("\n");
}

// ─── Inventory read model ────────────────────────────────────────────────────

export async function renderInventoryMetrics(): Promise<string> {
  const [
    totalAssets,
    totalLocations,
    assetsWithoutHostname,
    assetsByType,
    assetsByManufacturer,
    allLocations,
    assetsByLocation,
    workLogsByLocation,
    monitoredAssets,
    typeNames,
    mfrNames,
    nis2,
  ] = await Promise.all([
    // Decommissioned assets are historical, not current inventory, so every
    // inventory gauge below counts INSTALLED assets only.
    prisma.asset.count({ where: { status: "INSTALLED" } }),

    prisma.location.count(),

    prisma.asset.count({ where: { status: "INSTALLED", hostname: null } }),

    prisma.asset.groupBy({
      by: ["typeId"],
      _count: { id: true },
      where: { status: "INSTALLED", typeId: { not: null } },
    }),

    prisma.asset.groupBy({
      by: ["manufacturerId"],
      _count: { id: true },
      where: { status: "INSTALLED", manufacturerId: { not: null } },
    }),

    // All locations with their FI numbers (for campus breakdown and, via
    // parentId, resolving the FI number a room inherits from its ancestors)
    prisma.location.findMany({
      select: { id: true, name: true, fiNumber: true, parentId: true },
    }),

    prisma.asset.groupBy({
      by: ["locationId"],
      _count: { id: true },
      where: { status: "INSTALLED" },
    }),

    prisma.workLog.groupBy({
      by: ["locationId"],
      _count: { id: true },
    }),

    prisma.asset.findMany({
      where: MONITORED_ASSET_WHERE,
      select: {
        hostname: true,
        model: { select: { name: true } },
        criticality: true,
        endOfSupportDate: true,
        locationId: true,
        location: { select: { name: true, inMaintenance: true } },
        type: { select: { name: true, defaultCriticality: true } },
        manufacturer: { select: { name: true } },
      },
      orderBy: { hostname: "asc" },
    }),

    prisma.assetType.findMany({ select: { id: true, name: true } }),
    prisma.manufacturer.findMany({ select: { id: true, name: true } }),

    computeNis2Counts(),
  ]);

  const typeMap = new Map(typeNames.map((t) => [t.id, t.name]));
  const mfrMap = new Map(mfrNames.map((m) => [m.id, m.name]));

  const locationsById = new Map(allLocations.map((l) => [l.id, l]));

  /** Nearest FI number walking leaf → root, same rule as /api/prometheus/sd. */
  const inheritedFiNumber = (locationId: string) =>
    findFiNumber(ancestorChain(locationId, locationsById));

  // Campus-level asset counts from the (inherited) FI number's campus segment
  const campusCounts = new Map<string, number>();
  let assetsWithoutFiNumber = 0;
  for (const row of assetsByLocation) {
    const fiNumber = inheritedFiNumber(row.locationId);
    // No FI number anywhere in the location's chain
    if (!fiNumber) assetsWithoutFiNumber += row._count.id;
    const parts = parseFiNumber(fiNumber);
    if (parts) {
      campusCounts.set(
        parts.campus,
        (campusCounts.get(parts.campus) ?? 0) + row._count.id
      );
    }
  }

  // ─── Build the Prometheus text output ──────────────────────────────────────

  const sections: string[] = [];

  /** Unlabelled gauges, in exposition order; a null value leaves the gauge out. */
  const scalars = (rows: [name: string, help: string, value: number | null][]) => {
    for (const [name, help, value] of rows) {
      if (value !== null) sections.push(gauge(name, help, [{ value }]));
    }
  };

  scalars([
    ["sam_assets_total", "Installed assets in SAM (in-repair and decommissioned assets excluded)", totalAssets],
    ["sam_locations_total", "Total number of locations in SAM", totalLocations],
    [
      "sam_assets_without_hostname_total",
      "Installed assets with no hostname set — cannot be matched to monitoring targets",
      assetsWithoutHostname,
    ],
    [
      "sam_assets_without_fi_number_total",
      "Assets in locations that have no FI number — location metadata is incomplete",
      assetsWithoutFiNumber,
    ],
  ]);

  if (assetsByType.length > 0) {
    sections.push(
      gauge(
        "sam_assets_by_type",
        "Number of assets grouped by asset type",
        assetsByType.map((row) => ({
          labels: { type: typeMap.get(row.typeId!) ?? "unknown" },
          value: row._count.id,
        }))
      )
    );
  }

  if (assetsByManufacturer.length > 0) {
    sections.push(
      gauge(
        "sam_assets_by_manufacturer",
        "Number of assets grouped by manufacturer",
        assetsByManufacturer.map((row) => ({
          labels: { manufacturer: mfrMap.get(row.manufacturerId!) ?? "unknown" },
          value: row._count.id,
        }))
      )
    );
  }

  if (campusCounts.size > 0) {
    sections.push(
      gauge(
        "sam_assets_by_campus",
        "Number of assets grouped by campus code (derived from FI number)",
        Array.from(campusCounts.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([campus, count]) => ({
            labels: { campus },
            value: count,
          }))
      )
    );
  }

  scalars([
    [
      "sam_locations_without_fi_number_total",
      "Locations that have no FI number assigned",
      allLocations.filter((l) => !l.fiNumber).length,
    ],
    ["sam_assets_missing_owner", "Installed assets without a responsible owner", nis2.assetsMissingOwner],
    [
      "sam_assets_missing_criticality",
      "Installed assets without an effective criticality classification",
      nis2.assetsMissingCriticality,
    ],
    [
      "sam_assets_past_end_of_support",
      "Installed assets whose end-of-support date has passed",
      nis2.assetsPastEndOfSupport,
    ],
    [
      "sam_assets_no_end_of_support_date",
      "Installed assets without an end-of-support date",
      nis2.assetsWithoutEndOfSupportDate,
    ],
    // null when no inventory-review work-log item is configured
    [
      "sam_locations_missing_review",
      "Leaf locations without the configured inventory-review work-log item in the review period",
      nis2.locationsMissingReview,
    ],
    [
      "sam_users_credentials_without_2fa",
      "Local (credentials) user accounts with no second factor (neither TOTP nor a passkey)",
      nis2.usersWithout2fa,
    ],
    [
      "sam_audit_forward_backlog",
      "Audit log rows not yet forwarded to the configured syslog server",
      nis2.auditBacklog,
    ],
  ]);

  // One series per asset that is expected to report. Grafana joins these
  // against the device metrics on sam_hostname, so the label names here must
  // match the sam_* group labels emitted by /api/prometheus/sd exactly.
  //
  //   sam_asset_info unless on (sam_hostname) (probe_success == 1)
  //     → assets that should be reporting but are not
  //
  // Every label is always emitted (empty when unknown) so the series shape
  // stays stable and `count by (sam_fi_number)` never silently splits.

  const infoSamples: Sample[] = [];
  const maintenanceSamples: Sample[] = [];
  const eosSamples: Sample[] = [];

  for (const asset of monitoredAssets) {
    infoSamples.push({
      labels: {
        ...samAssetLabels({ ...asset, hostname: asset.hostname! }, ancestorChain(asset.locationId, locationsById)),
        sam_criticality: effectiveCriticality(asset.criticality, asset.type?.defaultCriticality) ?? "",
      },
      value: 1,
    });

    if (asset.location.inMaintenance) {
      maintenanceSamples.push({
        labels: { sam_hostname: asset.hostname! },
        value: 1,
      });
    }

    if (asset.endOfSupportDate) {
      eosSamples.push({
        labels: { sam_hostname: asset.hostname! },
        value: Math.floor(asset.endOfSupportDate.getTime() / 1000),
      });
    }
  }

  sections.push(
    gauge(
      "sam_asset_info",
      "One series per asset expected to report, carrying its SAM metadata",
      infoSamples
    )
  );

  sections.push(
    gauge(
      "sam_asset_maintenance",
      "Assets whose room is in maintenance — dropped from service discovery, so absence of metrics is expected",
      maintenanceSamples
    )
  );

  sections.push(
    gauge(
      "sam_asset_end_of_support_timestamp",
      "End-of-support date per asset as a Unix timestamp in seconds",
      eosSamples
    )
  );

  sections.push(
    gauge(
      "sam_worklog_items_by_location",
      "Number of work-log entries recorded per room",
      workLogsByLocation.map((row) => {
        const { sam_fi_number, sam_location_path, sam_location_name } = samLocationLabels(
          ancestorChain(row.locationId, locationsById)
        );
        return { labels: { sam_fi_number, sam_location_path, sam_location_name }, value: row._count.id };
      })
    )
  );

  // Prometheus text format: sections separated by blank lines, trailing newline
  return sections.join("\n\n") + "\n";
}
