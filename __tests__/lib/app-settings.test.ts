import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
    appSetting: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  deleteSettings,
  readBrandingSettings,
  readComplianceSetting,
  readComplianceSettings,
  readExportSettings,
  readGeneralSettings,
  readSettings,
  writeComplianceSettings,
  writeExportSettings,
  writeGeneralSettings,
  writeSettings,
} from "@/lib/app-settings";

const stored = (rows: Record<string, string>) =>
  vi.mocked(prisma.appSetting.findMany).mockResolvedValue(Object.entries(rows).map(([key, value]) => ({ key, value })) as never);
const writtenKeys = () => Object.fromEntries(vi.mocked(prisma.appSetting.upsert).mock.calls.map(([arg]) => [arg.where.key, arg.create.value]));

beforeEach(() => vi.clearAllMocks());

describe("readSettings()", () => {
  it("returns a key → value map for the requested keys", async () => {
    vi.mocked(prisma.appSetting.findMany).mockResolvedValue([{ key: "app.title", value: "SAM" }] as never);
    expect(await readSettings(["app.title", "missing"])).toEqual({ "app.title": "SAM" });
    expect(prisma.appSetting.findMany).toHaveBeenCalledWith({ where: { key: { in: ["app.title", "missing"] } } });
  });
});

describe("writeSettings()", () => {
  it("upserts only defined values and returns them", async () => {
    const written = await writeSettings({ a: "1", b: undefined, c: "" });
    expect(written).toEqual({ a: "1", c: "" });
    expect(vi.mocked(prisma.appSetting.upsert).mock.calls.map(([arg]) => arg.where.key)).toEqual(["a", "c"]);
  });
});

describe("writeSettings() atomicity / deleteSettings()", () => {
  it("writes a group in one transaction", async () => {
    await writeSettings({ a: "1", b: "2" });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prisma.$transaction).mock.calls[0][0]).toHaveLength(2);
  });

  it("deletes the given keys in one statement", async () => {
    await deleteSettings(["a", "b"]);
    expect(prisma.appSetting.deleteMany).toHaveBeenCalledWith({ where: { key: { in: ["a", "b"] } } });
  });
});

describe("setting groups", () => {
  it("compliance: decodes values, with defaults for missing or non-numeric ones", async () => {
    stored({ "security.requireTwoFactor": "true", "audit.retentionDays": "abc", "assets.defaultOwnerId": "" });
    expect(await readComplianceSettings()).toEqual({
      requireTwoFactor: true,
      auditRetentionDays: 730,
      defaultOwnerId: null,
      reviewWorkLogItemId: null,
      reviewPeriodMonths: 12,
    });
  });

  it("compliance: one field in a single query, decoded the same way (only \"true\" is on)", async () => {
    vi.mocked(prisma.appSetting.findUnique).mockResolvedValueOnce({ value: "yes" } as never);
    expect(await readComplianceSetting("requireTwoFactor")).toBe(false);
    vi.mocked(prisma.appSetting.findUnique).mockResolvedValueOnce(null as never);
    expect(await readComplianceSetting("reviewPeriodMonths")).toBe(12);
    expect(prisma.appSetting.findUnique).toHaveBeenLastCalledWith({ where: { key: "compliance.reviewPeriodMonths" }, select: { value: true } });
  });

  it("compliance: writes only the fields given, null clearing an id", async () => {
    await writeComplianceSettings({ reviewPeriodMonths: 6, defaultOwnerId: null });
    expect(writtenKeys()).toEqual({ "compliance.reviewPeriodMonths": "6", "assets.defaultOwnerId": "" });
  });

  it("general: templates default to empty and are written together", async () => {
    stored({ "hostname.urlTemplate": "https://g/{hostname}" });
    expect(await readGeneralSettings()).toEqual({ hostnameUrlTemplate: "https://g/{hostname}", macAddressUrlTemplate: "", locationUrlTemplate: "" });
    await writeGeneralSettings({ hostnameUrlTemplate: "", macAddressUrlTemplate: "m", locationUrlTemplate: "" });
    expect(writtenKeys()).toEqual({ "hostname.urlTemplate": "", "macAddress.urlTemplate": "m", "location.urlTemplate": "" });
  });

  it("branding: an empty title falls back to SAM", async () => {
    stored({ "app.title": "", "branding.logoStorageKey": "branding/logo.png" });
    expect(await readBrandingSettings()).toEqual({ appTitle: "SAM", hasLogo: true, hasFavicon: false, backgroundMode: "", hasCustomBackground: false });
  });

  it("export: defaults, and partial writes", async () => {
    stored({});
    expect(await readExportSettings()).toEqual({ cronExpression: "0 2 * * *", outputDir: "/backups", enabled: false });
    await writeExportSettings({ enabled: true, outputDir: null });
    expect(writtenKeys()).toEqual({ "export.enabled": "true", "export.outputDir": "" });
  });
});
