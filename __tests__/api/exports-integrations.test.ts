import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  prisma: { report: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/csv/export", () => ({ generateActiveAssetsCsv: vi.fn() }));
vi.mock("@/lib/reports/engine", () => ({ runReport: vi.fn() }));
vi.mock("@/lib/integrations/jira", () => ({
  isJiraConfigured: vi.fn(),
  isValidJiraKey: vi.fn(),
  fetchJiraIssue: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateActiveAssetsCsv } from "@/lib/csv/export";
import { runReport } from "@/lib/reports/engine";
import { isJiraConfigured, isValidJiraKey, fetchJiraIssue } from "@/lib/integrations/jira";

import { GET as exportCsv } from "@/app/api/export/csv/route";
import { GET as exportReport } from "@/app/api/reports/[id]/export/route";
import { GET as geocode } from "@/app/api/geocode/route";
import { GET as jiraIssue } from "@/app/api/jira/issue/[key]/route";

const mockAuth = vi.mocked(auth);
const session = (role = "ADMIN") => ({ user: { id: "u1", role, email: "a@b.com" } });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/export/csv", () => {
  function req(headers?: Record<string, string>) {
    return new NextRequest("http://localhost/api/export/csv", { headers });
  }
  it("401 when neither session nor export token present", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await exportCsv(req())).status).toBe(401);
  });
  it("403 for a non-admin session", async () => {
    mockAuth.mockResolvedValue(session("MAINTAINER") as never);
    expect((await exportCsv(req())).status).toBe(403);
    expect(generateActiveAssetsCsv).not.toHaveBeenCalled();
  });
  it("200 with a valid EXPORT_TOKEN and no session", async () => {
    process.env.EXPORT_TOKEN = "export-token";
    mockAuth.mockResolvedValue(null as never);
    vi.mocked(generateActiveAssetsCsv).mockResolvedValue("A");
    expect((await exportCsv(req({ authorization: "Bearer export-token" }))).status).toBe(200);
    delete process.env.EXPORT_TOKEN;
  });
  it("streams CSV with download headers for an admin", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    vi.mocked(generateActiveAssetsCsv).mockResolvedValue("A;B\r\n1;2");
    const res = await exportCsv(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toMatch(/attachment; filename="sam-export-\d{4}-\d{2}-\d{2}\.csv"/);
    expect(await res.text()).toBe("A;B\r\n1;2");
  });
});

describe("GET /api/reports/[id]/export", () => {
  const params = Promise.resolve({ id: "r1" });
  const req = () => new NextRequest("http://localhost/api/reports/r1/export");
  const VALID_DEF = JSON.stringify({ filters: [], groupBy: "none", columns: ["model"] });

  it("401 unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await exportReport(req(), { params })).status).toBe(401);
  });
  it("404 when report missing", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    vi.mocked(prisma.report.findUnique).mockResolvedValue(null as never);
    expect((await exportReport(req(), { params })).status).toBe(404);
  });
  it("422 when the stored definition is invalid", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    vi.mocked(prisma.report.findUnique).mockResolvedValue({ id: "r1", name: "R", definition: "not json" } as never);
    expect((await exportReport(req(), { params })).status).toBe(422);
  });
  it("runs the report and streams CSV with a sanitized filename", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    vi.mocked(prisma.report.findUnique).mockResolvedValue({ id: "r1", name: "Q1 / Report!", definition: VALID_DEF } as never);
    vi.mocked(runReport).mockResolvedValue({ source: "asset", rows: [{ model: "XPS" }], groups: [], total: 1 } as never);
    const res = await exportReport(req(), { params });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="Q1___Report_.csv"');
    const body = await res.text();
    expect(body.split("\n")[0]).toBe("Model");
    expect(body).toContain("XPS");
  });
});

describe("GET /api/geocode", () => {
  function req(q?: string) {
    const u = new URL("http://localhost/api/geocode");
    if (q !== undefined) u.searchParams.set("q", q);
    return new NextRequest(u);
  }
  it("401 unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await geocode(req("brussels"))).status).toBe(401);
  });
  it("400 when query is missing", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    expect((await geocode(req())).status).toBe(400);
  });
  it("passes through Nominatim results", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    const data = [{ display_name: "Ghent, BE", lat: "51.05", lon: "3.72" }];
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => data } as never);
    const res = await geocode(req("ghent"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(data);
  });
  it("502 when the upstream geocoder fails", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    global.fetch = vi.fn().mockResolvedValue({ ok: false } as never);
    expect((await geocode(req("ghent"))).status).toBe(502);
  });
});

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
    expect((await jiraIssue(req(), { params })).status).toBe(503);
  });
  it("400 on an invalid key format", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    vi.mocked(isJiraConfigured).mockReturnValue(true);
    vi.mocked(isValidJiraKey).mockReturnValue(false);
    expect((await jiraIssue(req(), { params })).status).toBe(400);
  });
  it("returns found:false when the issue is not found", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    vi.mocked(isJiraConfigured).mockReturnValue(true);
    vi.mocked(isValidJiraKey).mockReturnValue(true);
    vi.mocked(fetchJiraIssue).mockResolvedValue({ status: "missing" });
    const res = await jiraIssue(req(), { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ found: false, key: "ABC-1" });
  });
  it("returns found:true with the issue when present", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    vi.mocked(isJiraConfigured).mockReturnValue(true);
    vi.mocked(isValidJiraKey).mockReturnValue(true);
    vi.mocked(fetchJiraIssue).mockResolvedValue({ status: "found", issue: { key: "ABC-1", summary: "Fix" } } as never);
    const res = await jiraIssue(req(), { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ found: true, key: "ABC-1", summary: "Fix" });
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
