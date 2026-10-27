import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  prisma: {
    asset: { count: vi.fn(), findMany: vi.fn() },
    user: { count: vi.fn() },
    auditLog: { count: vi.fn() },
    appSetting: { findMany: vi.fn(), findUnique: vi.fn() },
    workLogItem: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/reports/engine", () => ({
  __esModule: true,
  runLocationReport: vi.fn(),
}));
vi.mock("@/lib/syslog", () => ({
  __esModule: true,
  isSyslogConfigured: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { runLocationReport } from "@/lib/reports/engine";
import { isSyslogConfigured } from "@/lib/syslog";
import { computeNis2Compliance, computeNis2Counts } from "@/lib/nis2-compliance";

const mockAssetCount = vi.mocked(prisma.asset.count);
const mockAssetFindMany = vi.mocked(prisma.asset.findMany);
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
