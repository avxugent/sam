import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  prisma: { appSetting: { findMany: vi.fn() } },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GET as getGeneral } from "@/app/api/settings/general/route";
import { GET as getExport } from "@/app/api/settings/export/route";
import { GET as getBranding } from "@/app/api/settings/branding/route";

const mockAuth = vi.mocked(auth);
const mockFindMany = vi.mocked(prisma.appSetting.findMany);
const session = (role = "ADMIN") => ({ user: { id: "u1", role, email: "a@b.com" } });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/settings/general", () => {
  it("401 unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await getGeneral()).status).toBe(401);
  });
  it("returns stored template values", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    mockFindMany.mockResolvedValue([
      { key: "hostname.urlTemplate", value: "https://h/{hostname}" },
      { key: "macAddress.urlTemplate", value: "https://m/{mac}" },
    ] as never);
    const res = await getGeneral();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hostnameUrlTemplate: "https://h/{hostname}", macAddressUrlTemplate: "https://m/{mac}" });
  });
  it("falls back to empty strings when unset", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    mockFindMany.mockResolvedValue([] as never);
    expect(await (await getGeneral()).json()).toEqual({ hostnameUrlTemplate: "", macAddressUrlTemplate: "" });
  });
});

describe("GET /api/settings/export", () => {
  it("401 unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await getExport()).status).toBe(401);
  });
  it("403 for non-admin", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    expect((await getExport()).status).toBe(403);
  });
  it("returns stored values incl. enabled=true", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    mockFindMany.mockResolvedValue([
      { key: "export.cronExpression", value: "0 3 * * *" },
      { key: "export.outputDir", value: "/data" },
      { key: "export.enabled", value: "true" },
    ] as never);
    expect(await (await getExport()).json()).toEqual({ cronExpression: "0 3 * * *", outputDir: "/data", enabled: true });
  });
  it("uses defaults when unset (enabled=false)", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    mockFindMany.mockResolvedValue([] as never);
    expect(await (await getExport()).json()).toEqual({ cronExpression: "0 2 * * *", outputDir: "/backups", enabled: false });
  });
});

describe("GET /api/settings/branding", () => {
  it("401 unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await getBranding()).status).toBe(401);
  });
  it("reports configured branding flags", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    mockFindMany.mockResolvedValue([
      { key: "app.title", value: "MyApp" },
      { key: "branding.logoStorageKey", value: "branding/logo" },
      { key: "branding.backgroundMode", value: "preset:testing" },
    ] as never);
    expect(await (await getBranding()).json()).toEqual({
      appTitle: "MyApp", hasLogo: true, hasFavicon: false, backgroundMode: "preset:testing", hasCustomBackground: false,
    });
  });
  it("returns defaults when nothing stored", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    mockFindMany.mockResolvedValue([] as never);
    expect(await (await getBranding()).json()).toEqual({
      appTitle: "SAM", hasLogo: false, hasFavicon: false, backgroundMode: "", hasCustomBackground: false,
    });
  });
});
