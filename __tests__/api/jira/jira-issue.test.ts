import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/integrations/jira", () => ({
  isJiraConfigured: vi.fn(),
  isValidJiraKey: vi.fn(),
  fetchJiraIssue: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { isJiraConfigured, isValidJiraKey, fetchJiraIssue } from "@/lib/integrations/jira";

import { GET as jiraIssue } from "@/app/api/jira/issue/[key]/route";

const mockAuth = vi.mocked(auth);
const session = (role = "ADMIN") => ({ user: { id: "u1", role, email: "a@b.com" } });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/jira/issue/[key]", () => {
  const params = Promise.resolve({ key: "ABC-1" });
  const req = () => new NextRequest("http://localhost/api/jira/issue/ABC-1");

  it("401 unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await jiraIssue(req(), { params })).status).toBe(401);
  });
  it("503 when Jira not configured", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    vi.mocked(isJiraConfigured).mockReturnValue(false);
    const res = await jiraIssue(req(), { params });
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("jiraNotConfigured");
  });
  it("400 on an invalid key format", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    vi.mocked(isJiraConfigured).mockReturnValue(true);
    vi.mocked(isValidJiraKey).mockReturnValue(false);
    expect((await jiraIssue(req(), { params })).status).toBe(400);
  });
  it("404 when the issue is not found", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    vi.mocked(isJiraConfigured).mockReturnValue(true);
    vi.mocked(isValidJiraKey).mockReturnValue(true);
    vi.mocked(fetchJiraIssue).mockResolvedValue({ status: "missing" });
    const res = await jiraIssue(req(), { params });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "JIRA issue not found." });
  });
  it("returns the issue when present", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    vi.mocked(isJiraConfigured).mockReturnValue(true);
    vi.mocked(isValidJiraKey).mockReturnValue(true);
    vi.mocked(fetchJiraIssue).mockResolvedValue({ status: "found", issue: { key: "ABC-1", summary: "Fix" } } as never);
    const res = await jiraIssue(req(), { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ key: "ABC-1", summary: "Fix" });
  });
  it("answers 502 jiraUnavailable when JIRA cannot be reached", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    vi.mocked(isJiraConfigured).mockReturnValue(true);
    vi.mocked(isValidJiraKey).mockReturnValue(true);
    vi.mocked(fetchJiraIssue).mockResolvedValue({ status: "unavailable" });
    const res = await jiraIssue(req(), { params });
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("jiraUnavailable");
  });
});
