import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  isJiraConfigured,
  isValidJiraKey,
  jiraIssueUrl,
  fetchJiraIssue,
  _clearJiraCacheForTest,
} from "@/lib/integrations/jira";

const origFetch = global.fetch;

beforeEach(() => {
  vi.stubEnv("JIRA_BASE_URL", "https://example.atlassian.net");
  vi.stubEnv("JIRA_EMAIL", "ci@example.com");
  vi.stubEnv("JIRA_API_TOKEN", "token-123");
  _clearJiraCacheForTest();
});

afterEach(() => {
  global.fetch = origFetch;
  vi.unstubAllEnvs();
});

// ── isJiraConfigured ─────────────────────────────────────────────────────────

describe("isJiraConfigured()", () => {
  it("returns true when all three env vars are set", () => {
    expect(isJiraConfigured()).toBe(true);
  });

  it("returns false when any env var is missing", () => {
    vi.stubEnv("JIRA_API_TOKEN", "");
    expect(isJiraConfigured()).toBe(false);
  });
});

// ── isValidJiraKey ───────────────────────────────────────────────────────────

describe("isValidJiraKey()", () => {
  it("accepts valid keys", () => {
    expect(isValidJiraKey("AVT-123")).toBe(true);
    expect(isValidJiraKey("PROJ_X-1")).toBe(true);
    expect(isValidJiraKey("A1-9999")).toBe(true);
  });

  it("rejects invalid keys", () => {
    expect(isValidJiraKey("avt-123")).toBe(false);
    expect(isValidJiraKey("123-AVT")).toBe(false);
    expect(isValidJiraKey("AVT")).toBe(false);
    expect(isValidJiraKey("AVT-")).toBe(false);
    expect(isValidJiraKey("")).toBe(false);
  });
});

// ── jiraIssueUrl ─────────────────────────────────────────────────────────────

describe("jiraIssueUrl()", () => {
  it("builds the browse URL", () => {
    expect(jiraIssueUrl("AVT-123")).toBe("https://example.atlassian.net/browse/AVT-123");
  });

  it("strips trailing slash from base URL", () => {
    vi.stubEnv("JIRA_BASE_URL", "https://example.atlassian.net/");
    expect(jiraIssueUrl("AVT-123")).toBe("https://example.atlassian.net/browse/AVT-123");
  });

  it("returns null for invalid key", () => {
    expect(jiraIssueUrl("not-a-key")).toBeNull();
  });

  it("returns null when not configured", () => {
    vi.stubEnv("JIRA_BASE_URL", "");
    expect(jiraIssueUrl("AVT-123")).toBeNull();
  });
});

// ── fetchJiraIssue ───────────────────────────────────────────────────────────

describe("fetchJiraIssue()", () => {
  it("returns null when not configured", async () => {
    vi.stubEnv("JIRA_BASE_URL", "");
    const result = await fetchJiraIssue("AVT-123");
    expect(result).toBeNull();
  });

  it("returns null for invalid key", async () => {
    const result = await fetchJiraIssue("bad");
    expect(result).toBeNull();
  });

  it("returns parsed issue on 200", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        fields: {
          summary: "Fix the projector",
          status: { name: "In Progress", statusCategory: { key: "indeterminate" } },
        },
      }),
    } as never);

    const result = await fetchJiraIssue("AVT-123");
    expect(result).toEqual({
      key: "AVT-123",
      summary: "Fix the projector",
      status: "In Progress",
      statusCategory: "in-progress",
      url: "https://example.atlassian.net/browse/AVT-123",
    });
  });

  it("maps known status categories", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        fields: {
          summary: "Done task",
          status: { name: "Done", statusCategory: { key: "done" } },
        },
      }),
    } as never);

    const result = await fetchJiraIssue("AVT-1");
    expect(result?.statusCategory).toBe("done");
  });

  it("returns null on 404", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 } as never);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await fetchJiraIssue("AVT-999");
    expect(result).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("returns null on auth failure (401)", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 } as never);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await fetchJiraIssue("AVT-1");
    expect(result).toBeNull();
    expect(warn).toHaveBeenCalledWith("[jira] HTTP 401 fetching AVT-1");
  });

  it("returns null on network error", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) as never;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await fetchJiraIssue("AVT-1");
    expect(result).toBeNull();
    expect(warn).toHaveBeenCalledWith("[jira] request for AVT-1 failed:", "ECONNREFUSED");
  });

  it("caches successful responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        fields: {
          summary: "Cached",
          status: { name: "To Do", statusCategory: { key: "new" } },
        },
      }),
    });
    global.fetch = fetchMock as never;

    await fetchJiraIssue("AVT-1");
    await fetchJiraIssue("AVT-1");
    await fetchJiraIssue("AVT-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caches null responses (404 isn't retried)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    global.fetch = fetchMock as never;

    await fetchJiraIssue("AVT-9");
    await fetchJiraIssue("AVT-9");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses HTTP Basic auth", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ fields: { summary: "x", status: { name: "x", statusCategory: { key: "new" } } } }),
    });
    global.fetch = fetchMock as never;

    await fetchJiraIssue("AVT-1");

    const [, init] = fetchMock.mock.calls[0];
    const expected = "Basic " + Buffer.from("ci@example.com:token-123").toString("base64");
    expect((init as { headers: Record<string, string> }).headers.Authorization).toBe(expected);
  });
});
