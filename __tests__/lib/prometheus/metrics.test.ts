import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  prisma: {
    asset: { count: vi.fn(), groupBy: vi.fn(), findMany: vi.fn() },
    workLog: { groupBy: vi.fn() },
    location: { count: vi.fn(), findMany: vi.fn() },
    assetType: { findMany: vi.fn() },
    manufacturer: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/compliance/nis2", () => ({
  __esModule: true,
  computeNis2Counts: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { computeNis2Counts } from "@/lib/compliance/nis2";
import { renderInventoryMetrics } from "@/lib/prometheus/metrics";

const LOCATIONS = [
  { id: "campus", name: "Campus A", fiNumber: null, parentId: null },
  { id: "bld", name: "Building 10", fiNumber: "14.10.100.001", parentId: "campus" },
  { id: "room", name: 'Room "013"', fiNumber: "14.10.100.013", parentId: "bld" },
  { id: "noFi", name: "Store\\room", fiNumber: null, parentId: "bld" },
  { id: "other", name: "Campus B", fiNumber: "15.01.000.01", parentId: null },
];

const MONITORED = [
  {
    hostname: "rec001",
    model: { name: "Pearl-2" },
    criticality: "HIGH",
    endOfSupportDate: new Date("2025-01-01T00:00:00Z"),
    locationId: "room",
    location: { name: 'Room "013"', inMaintenance: true },
    type: { name: "Recorder", defaultCriticality: "LOW" },
    manufacturer: { name: "Epiphan" },
  },
  {
    hostname: "cam002",
    model: null,
    criticality: null,
    endOfSupportDate: null,
    locationId: "noFi",
    location: { name: "Store\\room", inMaintenance: false },
    type: { name: "Camera", defaultCriticality: "MEDIUM" },
    manufacturer: null,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.asset.count).mockImplementation((async (args: { where: { hostname?: null } }) =>
    args.where.hostname === null ? 2 : 11) as never);
  vi.mocked(prisma.asset.groupBy).mockImplementation((async (args: { by: string[] }) => {
    switch (args.by[0]) {
      case "typeId":
        return [
          { typeId: "t1", _count: { id: 6 } },
          { typeId: "gone", _count: { id: 1 } },
        ];
      case "manufacturerId":
        return [{ manufacturerId: "m1", _count: { id: 5 } }];
      default:
        return [
          { locationId: "room", _count: { id: 4 } },
          { locationId: "noFi", _count: { id: 3 } },
          { locationId: "other", _count: { id: 2 } },
          { locationId: "campus", _count: { id: 2 } },
        ];
    }
  }) as never);
  vi.mocked(prisma.asset.findMany).mockResolvedValue(MONITORED as never);
  vi.mocked(prisma.workLog.groupBy).mockResolvedValue([
    { locationId: "room", _count: { id: 3 } },
    { locationId: "noFi", _count: { id: 1 } },
  ] as never);
  vi.mocked(prisma.location.count).mockResolvedValue(LOCATIONS.length as never);
  vi.mocked(prisma.location.findMany).mockResolvedValue(LOCATIONS as never);
  vi.mocked(prisma.assetType.findMany).mockResolvedValue([{ id: "t1", name: "Recorder" }] as never);
  vi.mocked(prisma.manufacturer.findMany).mockResolvedValue([{ id: "m1", name: "Epi\nphan" }] as never);
  vi.mocked(computeNis2Counts).mockResolvedValue({
    assetsMissingOwner: 4,
    assetsMissingCriticality: 3,
    assetsPastEndOfSupport: 2,
    assetsWithoutEndOfSupportDate: 9,
    locationsMissingReview: 5,
    usersWithout2fa: 1,
    auditBacklog: 6,
  });
});

// The full exposition for the fixtures above, byte for byte: the text the
// route emitted before the read model moved out of it.
const EXPECTED = String.raw`# HELP sam_assets_total Installed assets in SAM (in-repair and decommissioned assets excluded)
# TYPE sam_assets_total gauge
sam_assets_total 11

# HELP sam_locations_total Total number of locations in SAM
# TYPE sam_locations_total gauge
sam_locations_total 5

# HELP sam_assets_without_hostname_total Installed assets with no hostname set — cannot be matched to monitoring targets
# TYPE sam_assets_without_hostname_total gauge
sam_assets_without_hostname_total 2

# HELP sam_assets_without_fi_number_total Assets in locations that have no FI number — location metadata is incomplete
# TYPE sam_assets_without_fi_number_total gauge
sam_assets_without_fi_number_total 2

# HELP sam_assets_by_type Number of assets grouped by asset type
# TYPE sam_assets_by_type gauge
sam_assets_by_type{type="Recorder"} 6
sam_assets_by_type{type="unknown"} 1

# HELP sam_assets_by_manufacturer Number of assets grouped by manufacturer
# TYPE sam_assets_by_manufacturer gauge
sam_assets_by_manufacturer{manufacturer="Epi\nphan"} 5

# HELP sam_assets_by_campus Number of assets grouped by campus code (derived from FI number)
# TYPE sam_assets_by_campus gauge
sam_assets_by_campus{campus="14"} 7
sam_assets_by_campus{campus="15"} 2

# HELP sam_locations_without_fi_number_total Locations that have no FI number assigned
# TYPE sam_locations_without_fi_number_total gauge
sam_locations_without_fi_number_total 2

# HELP sam_assets_missing_owner Installed assets without a responsible owner
# TYPE sam_assets_missing_owner gauge
sam_assets_missing_owner 4

# HELP sam_assets_missing_criticality Installed assets without an effective criticality classification
# TYPE sam_assets_missing_criticality gauge
sam_assets_missing_criticality 3

# HELP sam_assets_past_end_of_support Installed assets whose end-of-support date has passed
# TYPE sam_assets_past_end_of_support gauge
sam_assets_past_end_of_support 2

# HELP sam_assets_no_end_of_support_date Installed assets without an end-of-support date
# TYPE sam_assets_no_end_of_support_date gauge
sam_assets_no_end_of_support_date 9

# HELP sam_locations_missing_review Leaf locations without the configured inventory-review work-log item in the review period
# TYPE sam_locations_missing_review gauge
sam_locations_missing_review 5

# HELP sam_users_credentials_without_2fa Local (credentials) user accounts with no second factor (neither TOTP nor a passkey)
# TYPE sam_users_credentials_without_2fa gauge
sam_users_credentials_without_2fa 1

# HELP sam_audit_forward_backlog Audit log rows not yet forwarded to the configured syslog server
# TYPE sam_audit_forward_backlog gauge
sam_audit_forward_backlog 6

# HELP sam_asset_info One series per asset expected to report, carrying its SAM metadata
# TYPE sam_asset_info gauge
sam_asset_info{sam_hostname="rec001",sam_fi_number="14.10.100.013",sam_campus="14",sam_building="10",sam_floor="100",sam_room="013",sam_location_path="Campus A / Building 10 / Room \"013\"",sam_location_name="Room \"013\"",sam_asset_type="Recorder",sam_manufacturer="Epiphan",sam_model="Pearl-2",sam_criticality="HIGH"} 1
sam_asset_info{sam_hostname="cam002",sam_fi_number="14.10.100.001",sam_campus="14",sam_building="10",sam_floor="100",sam_room="001",sam_location_path="Campus A / Building 10 / Store\\room",sam_location_name="Store\\room",sam_asset_type="Camera",sam_manufacturer="",sam_model="",sam_criticality="MEDIUM"} 1

# HELP sam_asset_maintenance Assets whose room is in maintenance — dropped from service discovery, so absence of metrics is expected
# TYPE sam_asset_maintenance gauge
sam_asset_maintenance{sam_hostname="rec001"} 1

# HELP sam_asset_end_of_support_timestamp End-of-support date per asset as a Unix timestamp in seconds
# TYPE sam_asset_end_of_support_timestamp gauge
sam_asset_end_of_support_timestamp{sam_hostname="rec001"} 1735689600

# HELP sam_worklog_items_by_location Number of work-log entries recorded per room
# TYPE sam_worklog_items_by_location gauge
sam_worklog_items_by_location{sam_fi_number="14.10.100.013",sam_location_path="Campus A / Building 10 / Room \"013\"",sam_location_name="Room \"013\""} 3
sam_worklog_items_by_location{sam_fi_number="14.10.100.001",sam_location_path="Campus A / Building 10 / Store\\room",sam_location_name="Store\\room"} 1
`;

describe("renderInventoryMetrics()", () => {
  it("renders the full Prometheus exposition from the inventory", async () => {
    expect(await renderInventoryMetrics()).toBe(EXPECTED);
  });

  it("leaves out the review gauge when no review item is configured", async () => {
    vi.mocked(computeNis2Counts).mockResolvedValue({
      assetsMissingOwner: 4,
      assetsMissingCriticality: 3,
      assetsPastEndOfSupport: 2,
      assetsWithoutEndOfSupportDate: 9,
      locationsMissingReview: null,
      usersWithout2fa: 1,
      auditBacklog: 6,
    });
    const body = await renderInventoryMetrics();
    expect(body).toBe(
      EXPECTED.replace(
        "# HELP sam_locations_missing_review Leaf locations without the configured inventory-review work-log item in the review period\n" +
          "# TYPE sam_locations_missing_review gauge\nsam_locations_missing_review 5\n\n",
        ""
      )
    );
  });
});
