/**
 * GET /api/prometheus/sd
 *
 * Prometheus HTTP Service Discovery endpoint.
 * Returns a JSON array of target groups in the http_sd format:
 * https://prometheus.io/docs/prometheus/latest/http_sd/
 *
 * Each asset that has a hostname becomes one target group annotated with
 * SAM metadata labels. When the asset's type has a scrapeTargetTemplate
 * configured, the rendered __address__, __metrics_path__, and __param_*
 * labels are included so Prometheus routes scrape requests to the correct
 * external exporter rather than directly to the device. If the asset type
 * also has an AssetTypeManufacturerTemplate matching the asset's brand, that
 * override is used instead of the type's default template.
 *
 * Credentials are never placed in the SD output. A template may emit the
 * asset's Vault path as a non-secret reference via {vault_path}; the external
 * exporter reads the secret from Vault itself and uses it to scrape the device.
 *
 * Authentication: Bearer token via PROMETHEUS_SD_TOKEN env var, or an active
 * admin session cookie (so admins can browse the endpoint directly).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * Prometheus scrape_configs example (exporter-based devices):
 *
 *   scrape_configs:
 *     - job_name: "av_devices"
 *       http_sd_configs:
 *         - url: "https://sam.example.com/api/prometheus/sd"
 *           refresh_interval: 5m
 *           authorization:
 *             type: Bearer
 *             credentials: "<PROMETHEUS_SD_TOKEN>"
 *       relabel_configs:
 *         # Let SAM's __address__ override the default host:port target
 *         - source_labels: [__address__]
 *           target_label: __address__
 *
 * Do NOT add a `regex: "sam_(.*)" / action: labelmap` rule here. Prometheus
 * already attaches every non-__ group label to the scraped series, so the rule
 * adds nothing. labelmap *copies* rather than renames, so it leaves every
 * device series carrying both sam_model and model, sam_hostname and hostname,
 * etc. — doubled cardinality, and the unprefixed copies can collide with
 * labels an exporter sets natively. Join on the sam_* names.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkPrometheusAuth } from "@/lib/prometheus-auth";
import { auth } from "@/lib/auth";
import {
  resolveLocationPath,
  parseFiNumber,
  buildLocationPathString,
  findFiNumber,
} from "@/lib/location-path";
import {
  renderScrapeTemplate,
  type TemplateVars,
} from "@/lib/scrape-template";

// Prometheus label values: allow printable ASCII, replace control chars
function safeLabel(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/[\x00-\x1f\x7f]/g, "_").trim();
}

export async function GET(req: NextRequest) {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";
  if (!isAdmin) {
    const authError = checkPrometheusAuth(req);
    if (authError) return authError;
  }

  // Fetch all assets that have a hostname
  const assets = await prisma.asset.findMany({
    where: { hostname: { not: null }, status: "INSTALLED" },
    select: {
      id: true,
      hostname: true,
      model: true,
      serialNumber: true,
      vaultPath: true,
      locationId: true,
      manufacturerId: true,
      location: { select: { inMaintenance: true } },
      type: {
        select: {
          name: true,
          scrapeTargetTemplate: true,
          prometheusExposed: true,
          manufacturerTemplates: {
            select: { manufacturerId: true, scrapeTargetTemplate: true },
          },
        },
      },
      manufacturer: { select: { name: true } },
    },
    orderBy: { hostname: "asc" },
  });

  // ── Caches (keyed by id/path) to avoid redundant lookups ──────────────────

  // locationId → resolved ancestor array
  const locationPathCache = new Map<
    string,
    Awaited<ReturnType<typeof resolveLocationPath>>
  >();

  async function getLocationPath(locationId: string) {
    if (!locationPathCache.has(locationId)) {
      locationPathCache.set(locationId, await resolveLocationPath(locationId));
    }
    return locationPathCache.get(locationId)!;
  }

  // ── Build target groups ────────────────────────────────────────────────────

  type TargetGroup = {
    targets: string[];
    labels: Record<string, string>;
  };

  const groups: TargetGroup[] = [];

  for (const asset of assets) {
    if (!asset.hostname) continue;
    if (asset.type && !asset.type.prometheusExposed) continue;
    // Room in maintenance — its assets are not scrape targets.
    if (asset.location?.inMaintenance) continue;

    // Resolve location metadata
    const ancestors = await getLocationPath(asset.locationId);
    const fiNumber = findFiNumber(ancestors);
    const fiParts = parseFiNumber(fiNumber);
    const locationPath = buildLocationPathString(ancestors);
    const roomName =
      ancestors.length > 0 ? ancestors[ancestors.length - 1].name : "";

    // Core SAM metadata labels (always included)
    const labels: Record<string, string> = {
      sam_hostname: safeLabel(asset.hostname),
      sam_location_path: safeLabel(locationPath),
      sam_location_name: safeLabel(roomName),
    };

    if (fiNumber) labels.sam_fi_number = fiNumber;
    if (fiParts) {
      labels.sam_campus = fiParts.campus;
      labels.sam_building = fiParts.building;
      labels.sam_floor = fiParts.floor;
      labels.sam_room = fiParts.room;
    }
    if (asset.type?.name) labels.sam_asset_type = safeLabel(asset.type.name);
    if (asset.manufacturer?.name)
      labels.sam_manufacturer = safeLabel(asset.manufacturer.name);
    if (asset.model) labels.sam_model = safeLabel(asset.model);

    // ── Scrape target template ───────────────────────────────────────────────
    // A manufacturer-specific override (if configured for this asset's brand)
    // wins over the asset type's default template.
    const manufacturerOverride = asset.type?.manufacturerTemplates.find(
      (t) => t.manufacturerId === asset.manufacturerId
    );
    const template = manufacturerOverride?.scrapeTargetTemplate ?? asset.type?.scrapeTargetTemplate;

    if (template?.trim()) {
      // Build the variable map from asset fields. vault_path is a non-secret
      // reference — the exporter resolves the actual credential from Vault.
      const vars: TemplateVars = {
        hostname_fqdn: asset.hostname,
        serial: asset.serialNumber ?? "",
        model: asset.model ?? "",
        manufacturer: asset.manufacturer?.name ?? "",
        fi_number: fiNumber ?? "",
        vault_path: asset.vaultPath ?? "",
      };

      // Render the template and merge __labels__ into the target group labels
      const { labels: templateLabels } = renderScrapeTemplate(template, vars);
      Object.assign(labels, templateLabels);
    }

    // The target string becomes __address__. Prometheus fills group labels only
    // where unset, so a template-provided __address__ would be silently dropped
    // if we always used the hostname here. Pull it out so the exporter address
    // wins; __address__ is host[:port] only, so lift any scheme into __scheme__.
    let address = asset.hostname;
    if (labels.__address__) {
      address = labels.__address__;
      delete labels.__address__;
      const schemeMatch = /^(https?):\/\/(.+)$/.exec(address);
      if (schemeMatch) {
        labels.__scheme__ = schemeMatch[1];
        address = schemeMatch[2];
      }
    }

    groups.push({
      targets: [address],
      labels,
    });
  }

  return NextResponse.json(groups, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-SAM-Target-Count": String(groups.length),
    },
  });
}
