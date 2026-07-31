/**
 * Grafana panel embedding.
 *
 * Panels are fetched through SAM rather than pointed at Grafana directly, so
 * Grafana never has to be reachable from a browser and its service-account
 * token never leaves the server. SAM's own session and role checks decide who
 * sees a panel.
 */

export function isGrafanaConfigured(): boolean {
  return !!(process.env.GRAFANA_URL && process.env.GRAFANA_TOKEN);
}

/** Grafana base URL with any trailing slash removed. */
export function grafanaBaseUrl(): string {
  return (process.env.GRAFANA_URL ?? "").replace(/\/+$/, "");
}

/**
 * Dashboard UIDs SAM is allowed to embed.
 *
 * The proxy is an authenticated hole through to Grafana, so the set of things
 * it can reach is fixed here rather than taken from the request. Without this
 * an embed URL could be pointed at Grafana's admin or datasource APIs by anyone
 * with a SAM session.
 */
export const EMBEDDABLE_DASHBOARDS = {
  room: { uid: "sam-room", slug: "room" },
  device: { uid: "sam-device", slug: "device" },
  fleet: { uid: "sam-fleet", slug: "fleet" },
} as const;

export type EmbeddableDashboard = keyof typeof EMBEDDABLE_DASHBOARDS;

/**
 * Builds the SAM-relative URL for one embedded panel.
 *
 * Panel ids are assigned by position in ops/jsonnet/lib/sam.libsonnet and must
 * stay stable — reordering panels in a dashboard re-points every embed.
 */
export function panelSrc(
  dashboard: EmbeddableDashboard,
  panelId: number,
  vars: Record<string, string>,
  opts: { from?: string; to?: string; theme?: string } = {}
): string {
  const params = new URLSearchParams({
    panelId: String(panelId),
    from: opts.from ?? "now-24h",
    to: opts.to ?? "now",
    theme: opts.theme ?? "light",
  });
  for (const [k, v] of Object.entries(vars)) {
    params.set(`var-${k}`, v);
  }
  return `/api/grafana-embed/${dashboard}?${params.toString()}`;
}

/**
 * Panel ids embedded by SAM.
 *
 * Kept in one place so a dashboard reorder is a single edit here rather than a
 * hunt through components. Verify against the built JSON:
 *   jq '.panels[] | {id, title}' ops/ansible/roles/grafana_sam/files/dashboards/sam-room.json
 */
export const PANELS = {
  room: {
    devices: 1,
    reporting: 2,
    notReporting: 3,
    neverScraped: 4,
    availability: 6,
    devicesTable: 8,
    availabilityOverTime: 10,
    probeDurationByDevice: 11,
  },
  device: {
    state: 1,
    firmware: 2,
    firmwareStatus: 3,
    reachability: 7,
    probeDuration: 8,
  },
} as const;

/**
 * Panel titles as of the ids above, asserted by
 * __tests__/lib/grafana-panels.test.ts against the built dashboard JSON.
 *
 * An embed pointing at the wrong panel renders a plausible-looking chart of the
 * wrong thing, which is worse than an error — hence the test rather than a
 * comment asking people to be careful.
 */
export const PANEL_TITLES: Record<string, Record<number, string>> = {
  "sam-room": {
    1: "Devices",
    2: "Reporting",
    3: "Not reporting",
    4: "Never scraped",
    6: "Availability",
    8: "Devices in this room",
    10: "Room availability",
    11: "Probe duration by device",
  },
  "sam-device": {
    1: "State",
    2: "Firmware",
    3: "Firmware status",
    7: "Reachability",
    8: "Probe duration",
  },
};
