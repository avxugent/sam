import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
      json: async () => ({ found: true, key: "ABC-1", summary: "Fix bug", status: "In Progress", statusCategory: "in-progress", url: "https://jira/browse/ABC-1" }),
    });
    render(<JiraIssueBadge issueKey="ABC-1" />);
    expect(await screen.findByText("Fix bug")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://jira/browse/ABC-1");
  });

  it("builds a fallback browse URL from jiraBaseUrl when not found", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ found: false }) });
    render(<JiraIssueBadge issueKey="ABC-9" jiraBaseUrl="https://jira.example.com/" />);
    await waitFor(() =>
      expect(screen.getByRole("link")).toHaveAttribute("href", "https://jira.example.com/browse/ABC-9")
    );
  });

  it("prevents navigation when no URL is resolvable", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ found: false }) });
    render(<JiraIssueBadge issueKey="ABC-2" />);
    await waitFor(() => expect(screen.getByRole("link")).toHaveAttribute("href", "#"));
  });

  it("falls back gracefully when the request errors", async () => {
    mockFetch.mockRejectedValue(new Error("network"));
    render(<JiraIssueBadge issueKey="ABC-3" jiraBaseUrl="https://j" />);
    await waitFor(() => expect(screen.getByRole("link")).toHaveAttribute("href", "https://j/browse/ABC-3"));
  });
});
