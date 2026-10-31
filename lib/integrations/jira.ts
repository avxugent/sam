/**
 * Atlassian JIRA REST API client (read-only) — zero external dependencies.
 *
 * Configuration via env vars:
 *   JIRA_BASE_URL    — e.g. https://yourcompany.atlassian.net (required)
 *   JIRA_EMAIL       — Atlassian account email (required)
 *   JIRA_API_TOKEN   — Atlassian API token from
 *                      https://id.atlassian.com/manage-profile/security/api-tokens (required)
 *
 * Nothing here throws: a lookup reports a JIRA outage as "unavailable" so
 * callers can degrade gracefully — a JIRA outage must never break the
 * location page.
 */

export type JiraStatusCategory = "todo" | "in-progress" | "done" | "unknown";

export type JiraIssue = {
  key: string;
  summary: string;
  status: string;
  statusCategory: JiraStatusCategory;
  url: string;
};

const JIRA_KEY_REGEX = /^[A-Z][A-Z0-9_]+-\d+$/;

export function isJiraConfigured(): boolean {
  return !!(
    process.env.JIRA_BASE_URL &&
    process.env.JIRA_EMAIL &&
    process.env.JIRA_API_TOKEN
  );
}

export function isValidJiraKey(key: string): boolean {
  return JIRA_KEY_REGEX.test(key);
}

/** JIRA_BASE_URL without a trailing slash, or null when unset. */
export function jiraBaseUrl(): string | null {
  return process.env.JIRA_BASE_URL?.replace(/\/$/, "") || null;
}

export function jiraIssueUrl(key: string): string | null {
  const base = jiraBaseUrl();
  if (!base || !isValidJiraKey(key)) return null;
  return `${base}/browse/${key}`;
}

/**
 * Result of an issue lookup. "missing": JIRA does not know the key.
 * "unavailable": not configured, unreachable or refusing our credentials;
 * never cached, so the next request tries again.
 */
export type JiraLookup =
  | { status: "found"; issue: JiraIssue }
  | { status: "missing" }
  | { status: "unavailable" };

function categorize(key: string | undefined): JiraStatusCategory {
  switch (key) {
    case "new":
    case "undefined":
      return "todo";
    case "indeterminate":
      return "in-progress";
    case "done":
      return "done";
    default:
      return "unknown";
  }
}

// ── In-memory cache ──────────────────────────────────────────────────────────
// 5-minute TTL keyed by issue key, so a location with many entries doesn't
// fan out an API call per badge. The cache is per process — fine for single
// node deployments and acceptable for clustered ones (each pod has its own).

type CacheEntry = { value: Exclude<JiraLookup, { status: "unavailable" }>; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Caches a lookup, dropping expired entries so the map only holds live keys. */
function remember(key: string, value: CacheEntry["value"]): void {
  const now = Date.now();
  for (const [k, entry] of cache) if (entry.expiresAt <= now) cache.delete(k);
  cache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
}

export function _clearJiraCacheForTest(): void {
  cache.clear();
}

function basicAuthHeader(): string {
  const email = process.env.JIRA_EMAIL!;
  const token = process.env.JIRA_API_TOKEN!;
  const encoded = Buffer.from(`${email}:${token}`).toString("base64");
  return `Basic ${encoded}`;
}

export async function fetchJiraIssue(key: string): Promise<JiraLookup> {
  const base = jiraBaseUrl();
  if (!isJiraConfigured() || !base) return { status: "unavailable" };
  if (!isValidJiraKey(key)) return { status: "missing" };

  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const url = `${base}/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,status`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: basicAuthHeader(),
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (res.status === 404) {
      remember(key, { status: "missing" });
      return { status: "missing" };
    }
    if (!res.ok) {
      // 401 bad token, 5xx, …: an operator problem, not an unknown key.
      console.warn(`[jira] HTTP ${res.status} fetching ${key}`);
      return { status: "unavailable" };
    }

    const body = (await res.json()) as {
      fields?: {
        summary?: string;
        status?: { name?: string; statusCategory?: { key?: string } };
      };
    };

    const lookup: JiraLookup = {
      status: "found",
      issue: {
        key,
        summary: body.fields?.summary ?? "",
        status: body.fields?.status?.name ?? "Unknown",
        statusCategory: categorize(body.fields?.status?.statusCategory?.key),
        url: `${base}/browse/${key}`,
      },
    };
    remember(key, lookup);
    return lookup;
  } catch (err) {
    console.warn(`[jira] request for ${key} failed:`, err instanceof Error ? err.message : err);
    return { status: "unavailable" };
  }
}
