/**
 * Atlassian JIRA REST API client (read-only) — zero external dependencies.
 *
 * Configuration via env vars:
 *   JIRA_BASE_URL    — e.g. https://yourcompany.atlassian.net (required)
 *   JIRA_EMAIL       — Atlassian account email (required)
 *   JIRA_API_TOKEN   — Atlassian API token from
 *                      https://id.atlassian.com/manage-profile/security/api-tokens (required)
 *
 * All public functions return null on any error so callers can degrade
 * gracefully — a JIRA outage must never break the location page.
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

export function jiraIssueUrl(key: string): string | null {
  if (!process.env.JIRA_BASE_URL || !isValidJiraKey(key)) return null;
  return `${process.env.JIRA_BASE_URL.replace(/\/$/, "")}/browse/${key}`;
}

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

type CacheEntry = { value: JiraIssue | null; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export function _clearJiraCacheForTest(): void {
  cache.clear();
}

function basicAuthHeader(): string {
  const email = process.env.JIRA_EMAIL!;
  const token = process.env.JIRA_API_TOKEN!;
  const encoded = Buffer.from(`${email}:${token}`).toString("base64");
  return `Basic ${encoded}`;
}

export async function fetchJiraIssue(key: string): Promise<JiraIssue | null> {
  if (!isJiraConfigured()) return null;
  if (!isValidJiraKey(key)) return null;

  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const base = process.env.JIRA_BASE_URL!.replace(/\/$/, "");
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

    if (!res.ok) {
      // 404 is an unknown key; anything else (401 bad token, 5xx) is an
      // operator problem that would otherwise look the same.
      if (res.status !== 404) console.warn(`[jira] HTTP ${res.status} fetching ${key}`);
      cache.set(key, { value: null, expiresAt: Date.now() + CACHE_TTL_MS });
      return null;
    }

    const body = (await res.json()) as {
      fields?: {
        summary?: string;
        status?: { name?: string; statusCategory?: { key?: string } };
      };
    };

    const issue: JiraIssue = {
      key,
      summary: body.fields?.summary ?? "",
      status: body.fields?.status?.name ?? "Unknown",
      statusCategory: categorize(body.fields?.status?.statusCategory?.key),
      url: `${base}/browse/${key}`,
    };

    cache.set(key, { value: issue, expiresAt: Date.now() + CACHE_TTL_MS });
    return issue;
  } catch (err) {
    console.warn(`[jira] request for ${key} failed:`, err instanceof Error ? err.message : err);
    cache.set(key, { value: null, expiresAt: Date.now() + CACHE_TTL_MS });
    return null;
  }
}
