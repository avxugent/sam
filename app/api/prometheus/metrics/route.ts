/**
 * GET /api/prometheus/metrics
 *
 * Exposes SAM inventory data in Prometheus text exposition format
 * (https://prometheus.io/docs/instrumenting/exposition_formats/).
 *
 * No external prom-client dependency — the format is simple enough to
 * produce as a string. All values are gauges (point-in-time counts).
 *
 * Authentication: Bearer token via PROMETHEUS_SD_TOKEN env var.
 *
 * Prometheus scrape_configs example:
 *
 *   scrape_configs:
 *     - job_name: "sam_inventory"
 *       metrics_path: /api/prometheus/metrics
 *       scheme: https
 *       authorization:
 *         type: Bearer
 *         credentials: "<PROMETHEUS_SD_TOKEN>"
 *       static_configs:
 *         - targets: ["sam.example.com"]
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkPrometheusAuth } from "@/lib/prometheus-auth";
import { parseFiNumber, buildLocationPathsFromRows } from "@/lib/location-path";
import { computeNis2Counts } from "@/lib/nis2-compliance";

// ─── Text format helpers ─────────────────────────────────────────────────────

/** Escape label values per the Prometheus text format spec */
function escapeLabelValue(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function gauge(
  name: string,
  help: string,
  samples: Array<{ labels?: Record<string, string>; value: number }>
): string {
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

// ─── Route handler ───────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const authError = checkPrometheusAuth(req);
  if (authError) return authError;

  // Run all DB queries in parallel for efficiency
  const [
    totalAssets,
    totalLocations,
    assetsWithoutHostname,
    assetsByType,
    assetsByManufacturer,
    allLocations,
    assetsByLocation,
    monitoredAssets,
  ] = await Promise.all([
    // Total asset count
    prisma.asset.count(),

    // Total location count
    prisma.location.count(),

    // Assets that have no hostname (monitoring gap)
    prisma.asset.count({ where: { hostname: null } }),

    // Assets grouped by type
    prisma.asset.groupBy({
      by: ["typeId"],
      _count: { id: true },
      where: { typeId: { not: null } },
    }),

    // Assets grouped by manufacturer
    prisma.asset.groupBy({
      by: ["manufacturerId"],
      _count: { id: true },
      where: { manufacturerId: { not: null } },
    }),

    // All locations with their FI numbers (for campus breakdown and, via
    // parentId, resolving the FI number a room inherits from its ancestors)
    prisma.location.findMany({
      select: { id: true, name: true, fiNumber: true, parentId: true },
    }),

    // Assets per locationId (to roll up to campus level)
    prisma.asset.groupBy({
      by: ["locationId"],
      _count: { id: true },
    }),

    // Assets that are expected to be monitored — same filter as the SD
    // endpoint except that rooms in maintenance are kept. Grafana needs the
    // full expected set to tell "not reporting" apart from "silenced".
    prisma.asset.findMany({
      where: {
        status: "INSTALLED",
        hostname: { not: null },
        OR: [{ typeId: null }, { type: { prometheusExposed: true } }],
      },
      select: {
        hostname: true,
        model: true,
        criticality: true,
        endOfSupportDate: true,
        locationId: true,
        location: { select: { name: true, inMaintenance: true } },
        type: { select: { name: true, defaultCriticality: true } },
        manufacturer: { select: { name: true } },
      },
      orderBy: { hostname: "asc" },
    }),
  ]);

  // Resolve typeId → name
  const typeNames = await prisma.assetType.findMany({
    select: { id: true, name: true },
  });
  const typeMap = new Map(typeNames.map((t) => [t.id, t.name]));

  // Resolve manufacturerId → name
  const mfrNames = await prisma.manufacturer.findMany({
    select: { id: true, name: true },
  });
  const mfrMap = new Map(mfrNames.map((m) => [m.id, m.name]));

  // Build campus-level asset counts using FI number segments
  // locationId → campus code
  const locationFiMap = new Map(
    allLocations.map((l) => [l.id, l.fiNumber])
  );

  const campusCounts = new Map<string, number>();
  for (const row of assetsByLocation) {
    const fiNumber = locationFiMap.get(row.locationId) ?? null;
    const parts = parseFiNumber(fiNumber);
    if (parts) {
      campusCounts.set(
        parts.campus,
        (campusCounts.get(parts.campus) ?? 0) + row._count.id
      );
    }
  }

  // Assets in locations without any FI number in their chain
  // (simple approximation: direct location has no fiNumber)
  const assetsWithoutFiNumber = assetsByLocation
    .filter((row) => !locationFiMap.get(row.locationId))
    .reduce((sum, row) => sum + row._count.id, 0);

  // ─── Build the Prometheus text output ──────────────────────────────────────

  const sections: string[] = [];

  // 1. Total counts
  sections.push(
    gauge("sam_assets_total", "Total number of assets in SAM", [
      { value: totalAssets },
    ])
  );

  sections.push(
    gauge("sam_locations_total", "Total number of locations in SAM", [
      { value: totalLocations },
    ])
  );

  // 2. Monitoring gap metrics
  sections.push(
    gauge(
      "sam_assets_without_hostname_total",
      "Assets with no hostname set — cannot be matched to monitoring targets",
      [{ value: assetsWithoutHostname }]
    )
  );

  sections.push(
    gauge(
      "sam_assets_without_fi_number_total",
      "Assets in locations that have no FI number — location metadata is incomplete",
      [{ value: assetsWithoutFiNumber }]
    )
  );

  // 3. Assets by type
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

  // 4. Assets by manufacturer
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

  // 5. Assets by campus (from FI numbers)
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

  // 6. Locations without FI number
  const locationsWithoutFi = allLocations.filter((l) => !l.fiNumber).length;
  sections.push(
    gauge(
      "sam_locations_without_fi_number_total",
      "Locations that have no FI number assigned",
      [{ value: locationsWithoutFi }]
    )
  );

  // 7. NIS2 compliance gauges
  const nis2 = await computeNis2Counts();
  sections.push(
    gauge("sam_assets_missing_owner", "Installed assets without a responsible owner", [
      { value: nis2.assetsMissingOwner },
    ])
  );
  sections.push(
    gauge(
      "sam_assets_missing_criticality",
      "Installed assets without an effective criticality classification",
      [{ value: nis2.assetsMissingCriticality }]
    )
  );
  sections.push(
    gauge(
      "sam_assets_past_end_of_support",
      "Installed assets whose end-of-support date has passed",
      [{ value: nis2.assetsPastEndOfSupport }]
    )
  );
  sections.push(
    gauge(
      "sam_assets_no_end_of_support_date",
      "Installed assets without an end-of-support date",
      [{ value: nis2.assetsWithoutEndOfSupportDate }]
    )
  );
  if (nis2.locationsMissingReview !== null) {
    sections.push(
      gauge(
        "sam_locations_missing_review",
        "Leaf locations without the configured inventory-review work-log item in the review period",
        [{ value: nis2.locationsMissingReview }]
      )
    );
  }
  sections.push(
    gauge(
      "sam_users_credentials_without_2fa",
      "Local (credentials) user accounts without TOTP two-factor enabled",
      [{ value: nis2.usersWithout2fa }]
    )
  );
  sections.push(
    gauge(
      "sam_audit_forward_backlog",
      "Audit log rows not yet forwarded to the configured syslog server",
      [{ value: nis2.auditBacklog }]
    )
  );

  // 8. Per-asset info series
  //
  // One series per asset that is expected to report. Grafana joins these
  // against the device metrics on sam_hostname, so the label names here must
  // match the sam_* group labels emitted by /api/prometheus/sd exactly.
  //
  //   sam_asset_info unless on (sam_hostname) (probe_success == 1)
  //     → assets that should be reporting but are not
  //
  // Every label is always emitted (empty when unknown) so the series shape
  // stays stable and `count by (sam_fi_number)` never silently splits.

  const locationsById = new Map(allLocations.map((l) => [l.id, l]));

  // Root → leaf name path per location, e.g. "Campus A / Building 10 / Room
  // 013" — same separator as buildLocationPathString() in /api/prometheus/sd
  // so sam_location_path reads identically wherever it's emitted.
  const locationPaths = buildLocationPathsFromRows(allLocations, " / ");

  /** Nearest FI number walking leaf → root; mirrors findFiNumber() in SD. */
  function inheritedFiNumber(locationId: string): string | null {
    let current = locationsById.get(locationId);
    while (current) {
      if (current.fiNumber) return current.fiNumber;
      current = current.parentId
        ? locationsById.get(current.parentId)
        : undefined;
    }
    return null;
  }

  const infoSamples: Array<{ labels: Record<string, string>; value: number }> = [];
  const maintenanceSamples: Array<{ labels: Record<string, string>; value: number }> = [];
  const eosSamples: Array<{ labels: Record<string, string>; value: number }> = [];

  for (const asset of monitoredAssets) {
    const fiNumber = inheritedFiNumber(asset.locationId);
    const parts = parseFiNumber(fiNumber);

    infoSamples.push({
      labels: {
        sam_hostname: asset.hostname!,
        sam_fi_number: fiNumber ?? "",
        sam_campus: parts?.campus ?? "",
        sam_building: parts?.building ?? "",
        sam_floor: parts?.floor ?? "",
        sam_room: parts?.room ?? "",
        sam_location_path: locationPaths.get(asset.locationId) ?? "",
        sam_location_name: asset.location?.name ?? "",
        sam_asset_type: asset.type?.name ?? "",
        sam_manufacturer: asset.manufacturer?.name ?? "",
        sam_model: asset.model ?? "",
        // Effective criticality: per-asset override wins over the type default
        sam_criticality:
          asset.criticality ?? asset.type?.defaultCriticality ?? "",
      },
      value: 1,
    });

    if (asset.location?.inMaintenance) {
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

  // Prometheus text format: sections separated by blank lines, trailing newline
  const body = sections.join("\n\n") + "\n";

  return new NextResponse(body, {
    status: 200,
    headers: {
      // Required content-type for Prometheus scraping
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
