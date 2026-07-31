/**
 * Reading monitoring numbers out of Prometheus for SAM's own pages.
 *
 * The room and device summaries used to be Grafana-rendered PNGs, one headless
 * browser page load each. Five per page, uncached, is seconds of latency for
 * what are ultimately four integers. Querying the recording rules directly
 * returns the same numbers as JSON in milliseconds, and SAM renders them in its
 * own styling.
 *
 * Grafana still owns the charts: a time series is worth an image (or a click
 * through to the live dashboard), a count is not.
 *
 * Everything here fails soft — a page must still render when Prometheus is
 * unreachable, showing "unavailable" rather than an error.
 */

import { grafanaBaseUrl } from "@/lib/grafana";

export function prometheusUrl(): string {
  return (process.env.PROMETHEUS_URL ?? "").replace(/\/+$/, "");
}

export function isPrometheusConfigured(): boolean {
  return !!prometheusUrl();
}

/** Guards against a slow Prometheus turning into a slow SAM page. */
const QUERY_TIMEOUT_MS = 2500;

type VectorResult = Array<{ metric: Record<string, string>; value: [number, string] }>;

/**
 * Runs one instant query. Returns null on any failure — unreachable, timeout,
 * bad status, malformed body — because a monitoring summary is never worth
 * failing a page over.
 */
export async function instantQuery(query: string): Promise<VectorResult | null> {
  const base = prometheusUrl();
  if (!base) return null;

  const url = `${base}/api/v1/query?query=${encodeURIComponent(query)}`;
  const headers: Record<string, string> = {};
  if (process.env.PROMETHEUS_TOKEN) {
    headers.Authorization = `Bearer ${process.env.PROMETHEUS_TOKEN}`;
  }

  try {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = await res.json();
    if (body?.status !== "success" || body?.data?.resultType !== "vector") return null;
    return body.data.result as VectorResult;
  } catch {
    return null;
  }
}

/** First sample's value as a number, or null when the query returned nothing. */
async function scalarQuery(query: string): Promise<number | null> {
  const result = await instantQuery(query);
  if (!result || result.length === 0) return null;
  const n = Number(result[0].value[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * A returned object means Prometheus answered and knows this room, so every
 * count is a real number — an absent problem series means zero, not unknown.
 * The function returns null instead when nothing is known at all, which is why
 * these are not nullable.
 */
export type RoomMonitoring = {
  expected: number;
  reporting: number;
  down: number;
  neverScraped: number;
  maintenance: number;
  /** reporting / expected, or null when the room has no monitored assets. */
  availability: number | null;
};

/**
 * Monitoring summary for one room, read from the room:* recording rules.
 *
 * A room with nothing wrong has no series in the problem rules at all, so an
 * empty result means zero rather than unknown — but only when the room is known
 * to Prometheus. `expected` is the discriminator: if that is null, Prometheus
 * has nothing for this room and every figure is genuinely unknown.
 */
export async function roomMonitoring(fiNumber: string): Promise<RoomMonitoring | null> {
  const sel = `{sam_fi_number="${fiNumber.replace(/"/g, "")}"}`;

  const [expected, reporting, down, neverScraped, maintenance] = await Promise.all([
    scalarQuery(`sum(room:assets_expected:count${sel})`),
    scalarQuery(`sum(room:assets_reporting:count${sel})`),
    scalarQuery(`sum(room:assets_down:count${sel})`),
    scalarQuery(`sum(room:assets_never_scraped:count${sel})`),
    scalarQuery(`sum(room:assets_maintenance:count${sel})`),
  ]);

  // Prometheus is unreachable, or knows nothing about this room.
  if (expected === null) return null;

  return {
    expected,
    reporting: reporting ?? 0,
    down: down ?? 0,
    neverScraped: neverScraped ?? 0,
    maintenance: maintenance ?? 0,
    availability: expected > 0 ? (reporting ?? 0) / expected : null,
  };
}

export type DeviceMonitoring = {
  /** 1 reporting, 0 probed and failed, 2 in maintenance, null never scraped. */
  state: number | null;
  probeDurationSeconds: number | null;
};

export async function deviceMonitoring(hostname: string): Promise<DeviceMonitoring | null> {
  const sel = `{sam_hostname="${hostname.replace(/"/g, "")}"}`;

  const [state, duration] = await Promise.all([
    scalarQuery(
      `max by (sam_hostname) (probe_success${sel}) or ` +
        `(sam_asset_maintenance${sel} and on (sam_hostname) sam_asset_info${sel}) * 2`
    ),
    scalarQuery(`max by (sam_hostname) (probe_duration_seconds${sel})`),
  ]);

  // Distinguishing "never scraped" from "Prometheus is down" needs a second
  // signal: the asset is in the expected set either way, so ask for that.
  if (state === null) {
    const known = await scalarQuery(`count(sam_asset_info${sel})`);
    if (known === null) return null;
  }

  return { state, probeDurationSeconds: duration };
}

/** Link to the live dashboard, for the "open in Grafana" affordances. */
export function grafanaDashboardUrl(
  path: "sam-room/room" | "sam-device/device",
  vars: Record<string, string>
): string | null {
  const base = process.env.GRAFANA_PUBLIC_URL || grafanaBaseUrl();
  if (!base) return null;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(vars)) params.set(`var-${k}`, v);
  return `${base.replace(/\/+$/, "")}/d/${path}?${params.toString()}`;
}
