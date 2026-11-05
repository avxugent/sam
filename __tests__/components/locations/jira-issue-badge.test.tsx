import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import { JiraIssueBadge } from "@/components/locations/jira-issue-badge";

const mockFetch = vi.fn();
global.fetch = mockFetch as never;

beforeEach(() => vi.clearAllMocks());

describe("<JiraIssueBadge />", () => {
  it("shows the issue key immediately and a loading placeholder", async () => {
    mockFetch.mockReturnValue(new Promise(() => {})); // never resolves
    render(<JiraIssueBadge issueKey="ABC-1" />);
    expect(screen.getByText("ABC-1")).toBeInTheDocument();
    expect(screen.getByText("…")).toBeInTheDocument();
  });

  it("renders summary and status when the issue is found", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ key: "ABC-1", summary: "Fix bug", status: "In Progress", statusCategory: "in-progress", url: "https://jira/browse/ABC-1" }),
    });
    render(<JiraIssueBadge issueKey="ABC-1" />);
    expect(await screen.findByText("Fix bug")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://jira/browse/ABC-1");
  });

  it("says the issue is not found on a 404, with a fallback browse URL from jiraBaseUrl", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: "JIRA issue not found." }) });
    render(<JiraIssueBadge issueKey="ABC-9" jiraBaseUrl="https://jira.example.com/" />);
    expect(await screen.findByText("jiraIssueNotFound")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://jira.example.com/browse/ABC-9");
  });

  it("says JIRA is unavailable on an outage, not that the issue is missing", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 502, json: async () => ({ error: "JIRA could not be reached.", code: "jiraUnavailable" }) });
    render(<JiraIssueBadge issueKey="ABC-8" />);
    expect(await screen.findByText("jiraUnavailable")).toBeInTheDocument();
    expect(screen.queryByText("jiraIssueNotFound")).not.toBeInTheDocument();
  });

  it("prevents navigation when no URL is resolvable", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: "JIRA issue not found." }) });
    render(<JiraIssueBadge issueKey="ABC-2" />);
    await waitFor(() => expect(screen.getByRole("link")).toHaveAttribute("href", "#"));
  });

  it("falls back gracefully when the request errors", async () => {
    mockFetch.mockRejectedValue(new Error("network"));
    render(<JiraIssueBadge issueKey="ABC-3" jiraBaseUrl="https://j" />);
    await waitFor(() => expect(screen.getByRole("link")).toHaveAttribute("href", "https://j/browse/ABC-3"));
    expect(screen.getByText("jiraUnavailable")).toBeInTheDocument();
  });
});
