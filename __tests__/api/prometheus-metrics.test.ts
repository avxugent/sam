import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  prisma: {
    asset: { count: vi.fn(), groupBy: vi.fn(), findMany: vi.fn() },
    firmwareBaseline: { findMany: vi.fn() },
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
  computeFirmwareStatuses: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { checkPrometheusAuth } from "@/lib/prometheus-auth";
import { computeNis2Counts, computeFirmwareStatuses } from "@/lib/nis2-compliance";
import { GET } from "@/app/api/prometheus/metrics/route";
import { NextRequest, NextResponse } from "next/server";

const mockAuth = vi.mocked(checkPrometheusAuth);
const mockCounts = vi.mocked(computeNis2Counts);
const mockFirmware = vi.mocked(computeFirmwareStatuses);

const NO_FIRMWARE = { compliant: 0, outdated: 0, unknown: 0, unclassified: 0, no_data: 0 };

function req() {
  return new NextRequest("http://localhost/api/prometheus/metrics");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockReturnValue(null as never);
  vi.mocked(prisma.asset.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.asset.groupBy).mockResolvedValue([] as never);
  vi.mocked(prisma.asset.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.location.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.location.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.assetType.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.manufacturer.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.firmwareBaseline.findMany).mockResolvedValue([] as never);
  mockFirmware.mockResolvedValue([] as never);
  mockCounts.mockResolvedValue({
    assetsMissingOwner: 4,
    assetsMissingCriticality: 3,
    assetsPastEndOfSupport: 2,
    assetsWithoutEndOfSupportDate: 9,
    locationsMissingReview: 5,
    usersWithout2fa: 1,
    auditBacklog: 6,
    firmware: NO_FIRMWARE,
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
      firmware: NO_FIRMWARE,
    });
    const body = await (await GET(req())).text();
    expect(body).not.toContain("sam_locations_missing_review");
    expect(body).toContain("sam_assets_missing_owner 0");
  });
});

describe("GET /api/prometheus/metrics — per-asset info series", () => {
  const LOCATIONS = [
    { id: "campus", name: "Campus A", fiNumber: null, parentId: null },
    { id: "bld", name: "Building 10", fiNumber: "14.10.100.001", parentId: "campus" },
    { id: "room", name: "Room 013", fiNumber: "14.10.100.013", parentId: "bld" },
    { id: "noFi", name: "Store room", fiNumber: null, parentId: "bld" },
  ];

  function asset(overrides: Record<string, unknown> = {}) {
    return {
      hostname: "rectest001",
      model: "Pearl-2",
      criticality: "HIGH",
      endOfSupportDate: null,
      locationId: "room",
      location: { name: "Room 013", inMaintenance: false },
      type: { name: "Recorder", defaultCriticality: "LOW" },
      manufacturer: { name: "Epiphan" },
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.mocked(prisma.location.findMany).mockResolvedValue(LOCATIONS as never);
  });

  it("emits one fully-labelled series per monitored asset", async () => {
    vi.mocked(prisma.asset.findMany).mockResolvedValue([asset()] as never);
    const body = await (await GET(req())).text();
    expect(body).toContain(
      'sam_asset_info{sam_hostname="rectest001",sam_fi_number="14.10.100.013",' +
        'sam_campus="14",sam_building="10",sam_floor="100",sam_room="013",' +
        'sam_location_name="Room 013",sam_asset_type="Recorder",' +
        'sam_manufacturer="Epiphan",sam_model="Pearl-2",sam_criticality="HIGH"} 1'
    );
  });

  it("inherits the nearest ancestor FI number when the room has none", async () => {
    vi.mocked(prisma.asset.findMany).mockResolvedValue([
      asset({ locationId: "noFi", location: { name: "Store room", inMaintenance: false } }),
    ] as never);
    const body = await (await GET(req())).text();
    expect(body).toContain('sam_fi_number="14.10.100.001"');
    expect(body).toContain('sam_room="001"');
  });

  it("emits empty labels rather than dropping them when metadata is missing", async () => {
    vi.mocked(prisma.asset.findMany).mockResolvedValue([
      asset({
        locationId: "campus",
        location: { name: "Campus A", inMaintenance: false },
        model: null,
        type: null,
        manufacturer: null,
        criticality: null,
      }),
    ] as never);
    const body = await (await GET(req())).text();
    expect(body).toContain(
      'sam_asset_info{sam_hostname="rectest001",sam_fi_number="",sam_campus="",' +
        'sam_building="",sam_floor="",sam_room="",sam_location_name="Campus A",' +
        'sam_asset_type="",sam_manufacturer="",sam_model="",sam_criticality=""} 1'
    );
  });

  it("falls back to the asset type's default criticality", async () => {
    vi.mocked(prisma.asset.findMany).mockResolvedValue([
      asset({ criticality: null }),
    ] as never);
    const body = await (await GET(req())).text();
    expect(body).toContain('sam_criticality="LOW"');
  });

  it("still lists an asset in a maintenance room, flagged separately", async () => {
    vi.mocked(prisma.asset.findMany).mockResolvedValue([
      asset({ location: { name: "Room 013", inMaintenance: true } }),
    ] as never);
    const body = await (await GET(req())).text();
    // Present in the expected set — maintenance must not look like an outage
    expect(body).toContain('sam_asset_info{sam_hostname="rectest001"');
    expect(body).toContain('sam_asset_maintenance{sam_hostname="rectest001"} 1');
  });

  it("omits the maintenance series for a room that is not in maintenance", async () => {
    vi.mocked(prisma.asset.findMany).mockResolvedValue([asset()] as never);
    const body = await (await GET(req())).text();
    expect(body).not.toContain('sam_asset_maintenance{');
  });

  it("exposes the end-of-support date as a Unix timestamp", async () => {
    vi.mocked(prisma.asset.findMany).mockResolvedValue([
      asset({ endOfSupportDate: new Date("2025-01-01T00:00:00Z") }),
    ] as never);
    const body = await (await GET(req())).text();
    expect(body).toContain(
      'sam_asset_end_of_support_timestamp{sam_hostname="rectest001"} 1735689600'
    );
  });

  it("selects installed, hostname-bearing, Prometheus-exposed assets", async () => {
    vi.mocked(prisma.asset.findMany).mockResolvedValue([] as never);
    await GET(req());
    const call = vi.mocked(prisma.asset.findMany).mock.calls[0][0];
    expect(call?.where).toEqual({
      status: "INSTALLED",
      hostname: { not: null },
      OR: [{ typeId: null }, { type: { prometheusExposed: true } }],
    });
  });
});

describe("GET /api/prometheus/metrics — firmware currency", () => {
  it("emits one status series per asset and a version series only where known", async () => {
    mockFirmware.mockResolvedValue([
      { hostname: "rec001", version: "4.18.1", status: "compliant" },
      { hostname: "rec002", version: "4.12.3", status: "outdated" },
      // A blackbox-probed device: no API, so no version will ever arrive.
      { hostname: "proj001", version: null, status: "no_data" },
    ] as never);
    const body = await (await GET(req())).text();

    expect(body).toContain('sam_asset_firmware_status{sam_hostname="rec001",status="compliant"} 1');
    expect(body).toContain('sam_asset_firmware_status{sam_hostname="rec002",status="outdated"} 1');
    expect(body).toContain('sam_asset_firmware_status{sam_hostname="proj001",status="no_data"} 1');

    expect(body).toContain('sam_asset_firmware_info{sam_hostname="rec001",version="4.18.1"} 1');
    // No version reported means no version series — not an empty label.
    expect(body).not.toContain('sam_asset_firmware_info{sam_hostname="proj001"');
  });

  it("publishes the baselines so a dashboard can show what was expected", async () => {
    vi.mocked(prisma.firmwareBaseline.findMany).mockResolvedValue([
      { model: null, approvedVersion: "4.18.0", type: { name: "Recorder" } },
      { model: "Pearl Mini", approvedVersion: "4.17.0", type: { name: "Recorder" } },
    ] as never);
    const body = await (await GET(req())).text();
    expect(body).toContain(
      'sam_firmware_baseline_info{sam_asset_type="Recorder",sam_model="",version="4.18.0"} 1'
    );
    expect(body).toContain(
      'sam_firmware_baseline_info{sam_asset_type="Recorder",sam_model="Pearl Mini",version="4.17.0"} 1'
    );
  });

  it("counts unmeasured assets apart from compliant ones", async () => {
    mockCounts.mockResolvedValue({
      assetsMissingOwner: 0,
      assetsMissingCriticality: 0,
      assetsPastEndOfSupport: 0,
      assetsWithoutEndOfSupportDate: 0,
      locationsMissingReview: null,
      usersWithout2fa: 0,
      auditBacklog: 0,
      firmware: { compliant: 7, outdated: 2, unknown: 1, unclassified: 3, no_data: 5 },
    });
    const body = await (await GET(req())).text();
    expect(body).toContain('sam_assets_firmware{status="compliant"} 7');
    expect(body).toContain('sam_assets_firmware{status="outdated"} 2');
    expect(body).toContain('sam_assets_firmware{status="unknown"} 1');
    expect(body).toContain('sam_assets_firmware{status="unclassified"} 3');
    expect(body).toContain('sam_assets_firmware{status="no_data"} 5');
  });
});
