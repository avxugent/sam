import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  prisma: {
    asset: { count: vi.fn(), groupBy: vi.fn() },
    location: { count: vi.fn(), findMany: vi.fn() },
    assetType: { findMany: vi.fn() },
    manufacturer: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/prometheus-auth", () => ({
  __esModule: true,
  checkPrometheusAuth: vi.fn(),
}));
vi.mock("@/lib/nis2-compliance", () => ({
  __esModule: true,
  computeNis2Counts: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { checkPrometheusAuth } from "@/lib/prometheus-auth";
import { computeNis2Counts } from "@/lib/nis2-compliance";
import { GET } from "@/app/api/prometheus/metrics/route";
import { NextRequest, NextResponse } from "next/server";

const mockAuth = vi.mocked(checkPrometheusAuth);
const mockCounts = vi.mocked(computeNis2Counts);

function req() {
  return new NextRequest("http://localhost/api/prometheus/metrics");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockReturnValue(null as never);
  vi.mocked(prisma.asset.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.asset.groupBy).mockResolvedValue([] as never);
  vi.mocked(prisma.location.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.location.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.assetType.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.manufacturer.findMany).mockResolvedValue([] as never);
  mockCounts.mockResolvedValue({
    assetsMissingOwner: 4,
    assetsMissingCriticality: 3,
    assetsPastEndOfSupport: 2,
    assetsWithoutEndOfSupportDate: 9,
    locationsMissingReview: 5,
    usersWithout2fa: 1,
    auditBacklog: 6,
  });
});

describe("GET /api/prometheus/metrics — NIS2 gauges", () => {
  it("returns the auth error untouched when the Bearer check fails", async () => {
    mockAuth.mockReturnValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }) as never);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("exposes the NIS2 compliance gauges", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("sam_assets_missing_owner 4");
    expect(body).toContain("sam_assets_missing_criticality 3");
    expect(body).toContain("sam_assets_past_end_of_support 2");
    expect(body).toContain("sam_assets_no_end_of_support_date 9");
    expect(body).toContain("sam_locations_missing_review 5");
    expect(body).toContain("sam_users_credentials_without_2fa 1");
    expect(body).toContain("sam_audit_forward_backlog 6");
  });

  it("omits the review gauge when the review item is not configured", async () => {
    mockCounts.mockResolvedValue({
      assetsMissingOwner: 0,
      assetsMissingCriticality: 0,
      assetsPastEndOfSupport: 0,
      assetsWithoutEndOfSupportDate: 0,
      locationsMissingReview: null,
      usersWithout2fa: 0,
      auditBacklog: 0,
    });
    const body = await (await GET(req())).text();
    expect(body).not.toContain("sam_locations_missing_review");
    expect(body).toContain("sam_assets_missing_owner 0");
  });
});
