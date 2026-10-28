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
 * external exporter rather than directly to the device. Overrides apply most
 * specific first: an AssetTypeModelTemplate matching the asset's brand + model,
 * then an AssetTypeManufacturerTemplate matching the asset's brand, then the
 * type's default template.
 *
 * Credentials are never placed in the SD output. A template may emit the
 * asset's Vault path as a non-secret reference via {vault_path}; the external
 * exporter reads the secret from Vault itself and uses it to scrape the device.
 *
 * Authentication: Bearer token via PROMETHEUS_SD_TOKEN env var, or a fully
 * signed-in admin session cookie (so admins can browse the endpoint directly).
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
import { sessionOrIntegrationTokenError } from "@/lib/tokens/session-or-integration";
import { getLocationPath } from "@/lib/locations/path";
import { samAssetLabels } from "@/lib/prometheus/labels";
import {
  renderScrapeTemplate,
  resolveScrapeTemplate,
  type TemplateVars,
} from "@/lib/prometheus/scrape-template";
import { isAdmin } from "@/lib/permissions";

// Labels emitted even when empty; other sam_* labels only when known.
const ALWAYS_PRESENT = new Set(["sam_hostname", "sam_location_path", "sam_location_name"]);

// Prometheus label values: allow printable ASCII, replace control chars
function safeLabel(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/[\x00-\x1f\x7f]/g, "_").trim();
}

export async function GET(req: NextRequest) {
  const authError = await sessionOrIntegrationTokenError(req, isAdmin);
  if (authError) return authError;

  const assets = await prisma.asset.findMany({
    where: { hostname: { not: null }, status: "INSTALLED" },
    select: {
      id: true,
      hostname: true,
      model: { select: { name: true } },
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
          modelTemplates: {
            select: { manufacturerId: true, model: true, scrapeTargetTemplate: true },
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
    Awaited<ReturnType<typeof getLocationPath>>
  >();

  async function cachedLocationPath(locationId: string) {
    if (!locationPathCache.has(locationId)) {
      locationPathCache.set(locationId, await getLocationPath(locationId));
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

    const ancestors = await cachedLocationPath(asset.locationId);
    const samLabels = samAssetLabels({ ...asset, hostname: asset.hostname }, ancestors);
    const labels: Record<string, string> = Object.fromEntries(
      Object.entries(samLabels)
        .map(([key, value]) => [key, safeLabel(value)])
        .filter(([key, value]) => value || ALWAYS_PRESENT.has(key))
    );

    // ── Scrape target template ───────────────────────────────────────────────
    // Most specific override wins: model+manufacturer → manufacturer → type default.
    const template = asset.type
      ? resolveScrapeTemplate(asset.type, asset.manufacturerId, asset.model?.name ?? null)
      : null;

    if (template?.trim()) {
      // Build the variable map from asset fields. vault_path is a non-secret
      // reference — the exporter resolves the actual credential from Vault.
      const vars: TemplateVars = {
        hostname_fqdn: asset.hostname,
        serial: asset.serialNumber ?? "",
        model: asset.model?.name ?? "",
        manufacturer: asset.manufacturer?.name ?? "",
        fi_number: samLabels.sam_fi_number,
        vault_path: asset.vaultPath ?? "",
      };

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
      "Cache-Control": "no-store",
      "X-SAM-Target-Count": String(groups.length),
    },
  });
}
