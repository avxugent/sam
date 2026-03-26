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
 * external exporter rather than directly to the device.
 *
 * Credential injection: if the template contains {vault_<key>} placeholders
 * and the asset has a vaultPath set, SAM fetches the secret from Vault
 * and substitutes the values. Assets with missing Vault config get the
 * label sam_vault_missing="true" so operators can alert on them.
 *
 * Authentication: Bearer token via PROMETHEUS_SD_TOKEN env var.
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
 *         # Carry all sam_* labels through to scraped metrics
 *         - regex: "sam_(.*)"
 *           action: labelmap
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkPrometheusAuth } from "@/lib/prometheus-auth";
import {
  resolveLocationPath,
  parseFiNumber,
  buildLocationPathString,
  findFiNumber,
} from "@/lib/location-path";
import { readVaultSecret } from "@/lib/vault";
import {
  renderScrapeTemplate,
  templateNeedsVault,
  type TemplateVars,
} from "@/lib/scrape-template";

// Prometheus label values: allow printable ASCII, replace control chars
function safeLabel(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/[\x00-\x1f\x7f]/g, "_").trim();
}

export async function GET(req: NextRequest) {
  const authError = checkPrometheusAuth(req);
  if (authError) return authError;

  // Fetch all assets that have a hostname
  const assets = await prisma.asset.findMany({
    where: { hostname: { not: null } },
    select: {
      id: true,
      hostname: true,
      model: true,
      serialNumber: true,
      vaultPath: true,
      locationId: true,
      type: {
        select: { name: true, scrapeTargetTemplate: true },
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

  // vaultPath → secret key/value map (or null on failure)
  const vaultCache = new Map<string, Record<string, string> | null>();

  async function getLocationPath(locationId: string) {
    if (!locationPathCache.has(locationId)) {
      locationPathCache.set(locationId, await resolveLocationPath(locationId));
    }
    return locationPathCache.get(locationId)!;
  }

  async function getVaultSecret(
    vaultPath: string
  ): Promise<Record<string, string> | null> {
    if (!vaultCache.has(vaultPath)) {
      vaultCache.set(vaultPath, await readVaultSecret(vaultPath));
    }
    return vaultCache.get(vaultPath)!;
  }

  // ── Build target groups ────────────────────────────────────────────────────

  type TargetGroup = {
    targets: string[];
    labels: Record<string, string>;
  };

  const groups: TargetGroup[] = [];

  for (const asset of assets) {
    if (!asset.hostname) continue;

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
    const template = asset.type?.scrapeTargetTemplate;

    if (template?.trim()) {
      // Build the variable map from asset fields
      const vars: TemplateVars = {
        hostname_fqdn: asset.hostname,
        serial: asset.serialNumber ?? "",
        model: asset.model ?? "",
        manufacturer: asset.manufacturer?.name ?? "",
        fi_number: fiNumber ?? "",
      };

      // Fetch Vault secret if needed
      let vaultSecrets: Record<string, string> | null = null;
      let vaultMissing = false;

      if (templateNeedsVault(template)) {
        if (asset.vaultPath) {
          vaultSecrets = await getVaultSecret(asset.vaultPath);
          if (!vaultSecrets) {
            // Vault lookup failed (connection error, 404, etc.)
            vaultMissing = true;
          }
        } else {
          // No vaultPath configured on this asset
          vaultMissing = true;
        }
      }

      // Render the template
      const { labels: templateLabels, hasUnresolvedVaultPlaceholders } =
        renderScrapeTemplate(template, vars, vaultSecrets);

      // Merge rendered __labels__ into the target group labels
      Object.assign(labels, templateLabels);

      if (vaultMissing || hasUnresolvedVaultPlaceholders) {
        labels.sam_vault_missing = "true";
      }
    }

    groups.push({
      targets: [asset.hostname],
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
