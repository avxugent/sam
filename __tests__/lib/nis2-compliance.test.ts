import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  prisma: {
    asset: { count: vi.fn(), findMany: vi.fn() },
    firmwareBaseline: { findMany: vi.fn() },
    user: { count: vi.fn() },
    auditLog: { count: vi.fn() },
    appSetting: { findMany: vi.fn(), findUnique: vi.fn() },
    workLogItem: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/report-engine", () => ({
  __esModule: true,
  runLocationReport: vi.fn(),
}));
vi.mock("@/lib/syslog", () => ({
  __esModule: true,
  isSyslogConfigured: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { runLocationReport } from "@/lib/report-engine";
import { isSyslogConfigured } from "@/lib/syslog";
import { computeNis2Compliance, computeNis2Counts } from "@/lib/nis2-compliance";

const mockAssetCount = vi.mocked(prisma.asset.count);
const mockAssetFindMany = vi.mocked(prisma.asset.findMany);
const mockBaselineFindMany = vi.mocked(prisma.firmwareBaseline.findMany);
const mockUserCount = vi.mocked(prisma.user.count);
const mockAuditCount = vi.mocked(prisma.auditLog.count);
const mockSettingFindMany = vi.mocked(prisma.appSetting.findMany);
const mockSettingFindUnique = vi.mocked(prisma.appSetting.findUnique);
const mockItemFindUnique = vi.mocked(prisma.workLogItem.findUnique);
const mockRunLocationReport = vi.mocked(runLocationReport);
const mockSyslogConfigured = vi.mocked(isSyslogConfigured);

beforeEach(() => {
  vi.clearAllMocks();
  mockAssetCount.mockResolvedValue(0 as never);
  mockAssetFindMany.mockResolvedValue([] as never);
  mockBaselineFindMany.mockResolvedValue([] as never);
  mockUserCount.mockResolvedValue(0 as never);
  mockAuditCount.mockResolvedValue(0 as never);
  mockSettingFindMany.mockResolvedValue([] as never);
  mockSettingFindUnique.mockResolvedValue(null as never);
  mockSyslogConfigured.mockReturnValue(false);
});

describe("computeNis2Compliance()", () => {
  it("reports unconfigured review when no review item is set", async () => {
    const result = await computeNis2Compliance();
    expect(result.locationsMissingReview).toEqual({ configured: false });
    expect(result.assetsMissingOwner.count).toBe(0);
    expect(result.auditBacklog.syslogConfigured).toBe(false);
  });

  it("counts owner/criticality/EOS gaps with samples", async () => {
    mockAssetCount.mockResolvedValue(3 as never);
    mockAssetFindMany.mockResolvedValue([
      { id: "a1", locationId: "l1", model: "M", serialNumber: null, hostname: null },
    ] as never);

    const result = await computeNis2Compliance();
    expect(result.assetsMissingOwner.count).toBe(3);
    expect(result.assetsMissingOwner.sample).toHaveLength(1);
    // The unclassified filter must use effective-criticality semantics
    expect(mockAssetCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          criticality: null,
          OR: [{ typeId: null }, { type: { defaultCriticality: null } }],
        }),
      })
    );
  });

  it("delegates the review stat to runLocationReport with the configured item and period", async () => {
    mockSettingFindMany.mockResolvedValue([
      { key: "compliance.reviewWorkLogItemId", value: "item-1" },
      { key: "compliance.reviewPeriodMonths", value: "6" },
    ] as never);
    mockItemFindUnique.mockResolvedValue({ name: "Review asset list" } as never);
    mockRunLocationReport.mockResolvedValue({
      source: "location",
      itemColumns: [{ id: "item-1", name: "Review asset list" }],
      rows: [
        { id: "loc-1", locationId: "loc-1", name: "Room 1", path: "Campus - B - Room 1", fiNumber: null, campus: "Campus", building: "B", items: {} },
      ],
      total: 1,
      filledCount: 4,
      notFilledCount: 1,
    } as never);

    const result = await computeNis2Compliance();
    expect(mockRunLocationReport).toHaveBeenCalledWith({
      source: "location",
      itemIds: ["item-1"],
      status: "notFilled",
      periodCount: 6,
      periodUnit: "months",
    });
    expect(result.locationsMissingReview).toEqual(
      expect.objectContaining({
        configured: true,
        count: 1,
        totalLeaves: 5,
        periodMonths: 6,
        itemName: "Review asset list",
        sample: [{ id: "loc-1", name: "Room 1", path: "Campus - B - Room 1" }],
      })
    );
  });

  it("treats a deleted review item as unconfigured", async () => {
    mockSettingFindMany.mockResolvedValue([
      { key: "compliance.reviewWorkLogItemId", value: "gone" },
    ] as never);
    mockItemFindUnique.mockResolvedValue(null as never);
    const result = await computeNis2Compliance();
    expect(result.locationsMissingReview).toEqual({ configured: false });
  });

  it("surfaces the global 2FA flag and syslog state", async () => {
    mockUserCount.mockResolvedValue(2 as never);
    mockSettingFindUnique.mockResolvedValue({ value: "true" } as never);
    mockSyslogConfigured.mockReturnValue(true);
    mockAuditCount.mockResolvedValue(7 as never);

    const result = await computeNis2Compliance();
    expect(result.usersWithout2fa).toEqual({ count: 2, globallyRequired: true });
    expect(result.auditBacklog).toEqual({ count: 7, syslogConfigured: true });
  });
});

describe("computeNis2Counts()", () => {
  it("returns null review count when the item is not configured", async () => {
    const counts = await computeNis2Counts();
    expect(counts.locationsMissingReview).toBeNull();
    expect(counts.assetsMissingOwner).toBe(0);
  });

  it("returns plain numbers for all configured stats", async () => {
    mockAssetCount.mockResolvedValue(5 as never);
    mockUserCount.mockResolvedValue(1 as never);
    mockAuditCount.mockResolvedValue(9 as never);
    // computeNis2Counts checks reviewWorkLogItemId via findUnique first
    mockSettingFindUnique.mockResolvedValue({ value: "item-1" } as never);
    mockSettingFindMany.mockResolvedValue([
      { key: "compliance.reviewWorkLogItemId", value: "item-1" },
    ] as never);
    mockItemFindUnique.mockResolvedValue({ name: "Review" } as never);
    mockRunLocationReport.mockResolvedValue({
      source: "location", itemColumns: [], rows: [], total: 0, filledCount: 2, notFilledCount: 3,
    } as never);

    const counts = await computeNis2Counts();
    expect(counts.assetsMissingOwner).toBe(5);
    expect(counts.usersWithout2fa).toBe(1);
    expect(counts.auditBacklog).toBe(9);
    expect(counts.locationsMissingReview).toBe(3);
  });
});

describe("computeFirmwareStatuses()", () => {
  it("classifies each asset against the most specific baseline", async () => {
    mockAssetFindMany.mockResolvedValue([
      { id: "a1", locationId: "l1", serialNumber: "S1", hostname: "rec001", typeId: "recorder", model: "Pearl Mini", firmwareVersion: "4.17.0", firmwareCheckedAt: new Date(), firmwareSource: "REPORTED" },
      { id: "a2", locationId: "l1", serialNumber: "S2", hostname: "rec002", typeId: "recorder", model: "Pearl Nano", firmwareVersion: "4.12.3", firmwareCheckedAt: new Date(), firmwareSource: "REPORTED" },
      // No API: blackbox-probed devices never report a version.
      { id: "a3", locationId: "l2", serialNumber: "S3", hostname: "proj001", typeId: "projector", model: "EB-W06", firmwareVersion: null, firmwareCheckedAt: null, firmwareSource: null },
      // No baseline configured for this type at all.
      { id: "a4", locationId: "l2", serialNumber: "S4", hostname: "sw001", typeId: "switcher", model: "ATEM", firmwareVersion: "9.1", firmwareCheckedAt: new Date(), firmwareSource: "REPORTED" },
    ] as never);
    mockSettingFindUnique.mockResolvedValue(null as never);
    mockBaselineFindMany.mockResolvedValue([
      { typeId: "recorder", model: null, approvedVersion: "4.18.0" },
      { typeId: "recorder", model: "Pearl Mini", approvedVersion: "4.17.0" },
      { typeId: "projector", model: null, approvedVersion: "1.08" },
    ] as never);

    const { computeFirmwareStatuses, tallyFirmware } = await import("@/lib/nis2-compliance");
    const statuses = await computeFirmwareStatuses();

    expect(statuses.map((s) => ({ hostname: s.hostname, version: s.version, status: s.status }))).toEqual([
      // Model-specific baseline (4.17.0) beats the type-wide one (4.18.0).
      { hostname: "rec001", version: "4.17.0", status: "compliant" },
      { hostname: "rec002", version: "4.12.3", status: "outdated" },
      { hostname: "proj001", version: null, status: "no_data" },
      { hostname: "sw001", version: "9.1", status: "unclassified" },
    ]);
    // Sample fields must ride along so the compliance dashboard can link to
    // the offending assets without a second query.
    expect(statuses[0]).toMatchObject({ id: "a1", locationId: "l1", serialNumber: "S1" });

    expect(tallyFirmware(statuses)).toEqual({
      compliant: 1,
      outdated: 1,
      stale: 0,
      unknown: 0,
      unclassified: 1,
      no_data: 1,
    });
  });
});

describe("computeFirmwareCompliance()", () => {
  it("groups the unmeasured states together and reports measurable coverage", async () => {
    mockAssetFindMany.mockResolvedValue([
      { id: "a1", locationId: "l1", serialNumber: "S1", hostname: "rec001", typeId: "recorder", model: null, firmwareVersion: "4.18.0", firmwareCheckedAt: new Date(), firmwareSource: "REPORTED" },
      { id: "a2", locationId: "l1", serialNumber: "S2", hostname: "rec002", typeId: "recorder", model: null, firmwareVersion: "4.12.0", firmwareCheckedAt: new Date(), firmwareSource: "REPORTED" },
      // Stale: at the baseline, but confirmed long ago.
      { id: "a3", locationId: "l1", serialNumber: "S3", hostname: "rec003", typeId: "recorder", model: null, firmwareVersion: "4.18.0", firmwareCheckedAt: new Date("2020-01-01"), firmwareSource: "ATTESTED" },
      // No API and nothing attested.
      { id: "a4", locationId: "l2", serialNumber: "S4", hostname: "proj001", typeId: "recorder", model: null, firmwareVersion: null, firmwareCheckedAt: null, firmwareSource: null },
    ] as never);
    mockBaselineFindMany.mockResolvedValue([
      { typeId: "recorder", model: null, approvedVersion: "4.18.0" },
    ] as never);
    mockSettingFindUnique.mockResolvedValue({ value: "90" } as never);

    const { computeFirmwareCompliance } = await import("@/lib/nis2-compliance");
    const r = await computeFirmwareCompliance();

    expect(r.outdated.count).toBe(1);
    expect(r.stale.count).toBe(1);
    expect(r.unmeasured.count).toBe(1);
    // 3 of 4 can be judged; the fourth can never report a version.
    expect(r.measuredCoverage).toBeCloseTo(0.75);
    expect(r.maxAgeDays).toBe(90);
    // Samples carry enough to link straight to the asset page.
    expect(r.outdated.sample[0]).toMatchObject({ id: "a2", locationId: "l1" });
  });

  it("reports null coverage rather than dividing by zero", async () => {
    mockAssetFindMany.mockResolvedValue([] as never);
    const { computeFirmwareCompliance } = await import("@/lib/nis2-compliance");
    expect((await computeFirmwareCompliance()).measuredCoverage).toBeNull();
  });
});
