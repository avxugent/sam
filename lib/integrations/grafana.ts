/** GRAFANA_URL (optional): the Grafana instance reports link to. */

/** Grafana's Explore view, or null when GRAFANA_URL is unset. */
export function grafanaExploreUrl(): string | null {
  const base = process.env.GRAFANA_URL?.replace(/\/$/, "");
  return base ? `${base}/explore` : null;
}
