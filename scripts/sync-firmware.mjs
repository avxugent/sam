/**
 * scripts/sync-firmware.mjs
 *
 * Reads the firmware version each device reports to Prometheus and stores it on
 * the asset, so SAM can compare it against the approved baseline.
 *
 * The comparison deliberately does not happen here — it lives in
 * lib/firmware.ts, so the SAM UI, the metrics endpoint and the NIS2 report all
 * read the same numbers. This script only answers "what is installed".
 *
 * Devices without an API (blackbox-probed) never report firmware, so they keep
 * a null firmwareVersion and are counted as *no_data* rather than compliant.
 *
 * Prometheus is queried, not scraped: one instant query for
 * device_firmware_info returns the whole fleet in a single request.
 *
 * Usage:
 *   node scripts/sync-firmware.mjs                       # sync all
 *   node scripts/sync-firmware.mjs --dry-run             # preview, no writes
 *   node scripts/sync-firmware.mjs --prometheus-url URL  # override PROMETHEUS_URL
 *   node scripts/sync-firmware.mjs --metric NAME         # default device_firmware_info
 *
 * Environment:
 *   PROMETHEUS_URL    e.g. http://prometheus:9090   (required unless --prometheus-url)
 *   PROMETHEUS_TOKEN  optional bearer token
 *
 * Run from the project root so that the .env file is found automatically.
 */

import { prisma } from "./_prisma.mjs";

// ── arg parsing ───────────────────────────────────────────────────────────────

function getArg(flag, defaultValue = null) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return defaultValue;
  return process.argv[idx + 1] ?? defaultValue;
}

const dryRun = process.argv.includes("--dry-run");
const metric = getArg("--metric", "device_firmware_info");
const prometheusUrl = (getArg("--prometheus-url", process.env.PROMETHEUS_URL) ?? "").replace(/\/$/, "");

if (!prometheusUrl) {
  console.error(
    "PROMETHEUS_URL is not set. Pass --prometheus-url http://prometheus:9090 or set it in .env."
  );
  process.exit(1);
}

// ── query ─────────────────────────────────────────────────────────────────────

async function queryPrometheus(query) {
  const url = `${prometheusUrl}/api/v1/query?query=${encodeURIComponent(query)}`;
  const headers = process.env.PROMETHEUS_TOKEN
    ? { Authorization: `Bearer ${process.env.PROMETHEUS_TOKEN}` }
    : {};

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Prometheus returned ${res.status} ${res.statusText} for ${url}`);
  }
  const body = await res.json();
  if (body.status !== "success") {
    throw new Error(`Prometheus query failed: ${body.error ?? "unknown error"}`);
  }
  return body.data?.result ?? [];
}

// ── main ──────────────────────────────────────────────────────────────────────

const started = new Date();
console.log(`Querying ${prometheusUrl} for ${metric} …`);

let series;
try {
  series = await queryPrometheus(metric);
} catch (err) {
  // A stale version is better than a wrong one: leave the database untouched
  // and let firmwareCheckedAt age, which the dashboard surfaces.
  console.error(`Failed to query Prometheus: ${err.message}`);
  console.error("No changes written. Existing firmware versions are left as-is.");
  process.exit(1);
}

// hostname → version. A device probed by more than one exporter can appear
// twice; the versions agree in practice, and last-wins is harmless either way.
const reported = new Map();
let missingLabels = 0;
for (const s of series) {
  const hostname = s.metric?.sam_hostname;
  const version = s.metric?.version;
  if (!hostname || !version) {
    missingLabels++;
    continue;
  }
  reported.set(hostname, version);
}

console.log(`  ${series.length} series, ${reported.size} device(s) reporting a version`);
if (missingLabels > 0) {
  console.warn(
    `  ${missingLabels} series skipped — missing sam_hostname or version label. ` +
      `Check the exporter emits version="…" and that service discovery attaches sam_*.`
  );
}

const assets = await prisma.asset.findMany({
  where: { status: "INSTALLED", hostname: { not: null } },
  select: { id: true, hostname: true, firmwareVersion: true, firmwareSource: true },
});

let changed = 0;
let unchanged = 0;
let noReport = 0;

for (const asset of assets) {
  const version = reported.get(asset.hostname);

  if (!version) {
    // No API, or unreachable at query time. Leave the stored version alone —
    // it is still the last known truth — and do not touch firmwareCheckedAt,
    // so staleness stays visible.
    noReport++;
    continue;
  }

  // A device that gained an API supersedes whatever was attested by hand:
  // measured evidence beats a person's recollection.
  if (asset.firmwareSource === "ATTESTED") {
    console.log(`  ${asset.hostname}: attested ${asset.firmwareVersion} → reported ${version}`);
  }

  if (asset.firmwareVersion === version && asset.firmwareSource === "REPORTED") {
    unchanged++;
    // Still refresh the timestamp: the value did not change, but it was
    // confirmed just now, which is what keeps it from ageing into "stale".
    if (!dryRun) {
      await prisma.asset.update({
        where: { id: asset.id },
        data: { firmwareCheckedAt: started },
      });
    }
    continue;
  }

  if (asset.firmwareSource !== "ATTESTED") {
    console.log(`  ${asset.hostname}: ${asset.firmwareVersion ?? "(none)"} → ${version}`);
  }
  changed++;
  if (!dryRun) {
    await prisma.asset.update({
      where: { id: asset.id },
      data: {
        firmwareVersion: version,
        firmwareCheckedAt: started,
        firmwareSource: "REPORTED",
        firmwareAttestedById: null,
      },
    });
  }
}

console.log(
  `\n${dryRun ? "[dry run] " : ""}${changed} updated, ${unchanged} unchanged, ` +
    `${noReport} without a reported version (no API, or unreachable).`
);

await prisma.$disconnect();
