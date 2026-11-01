import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  prisma: {
    appSetting: { findMany: vi.fn() },
  },
}));

const getObject = vi.fn();
vi.mock("@/lib/uploads/storage", async () => ({
  ...(await vi.importActual<typeof import("@/lib/uploads/storage")>("@/lib/uploads/storage")),
  getStorageDriver: () => ({ getObject, putObject: vi.fn(), deleteObject: vi.fn() }),
}));

import { prisma } from "@/lib/prisma";
import { StorageNotFoundError } from "@/lib/uploads/storage";
import { GET as getLogo } from "@/app/api/branding/logo/route";
import { GET as getFavicon } from "@/app/api/branding/favicon/route";
import { GET as getBackground } from "@/app/api/branding/background/route";

const mockSettings = vi.mocked(prisma.appSetting.findMany);
/** The asset's stored-file settings as AppSetting rows (null = not set). */
function settingRows(name: string, storageKey: string | null, contentType: string | null) {
  mockSettings.mockResolvedValue(
    [
      storageKey && { key: `branding.${name}StorageKey`, value: storageKey },
      contentType && { key: `branding.${name}ContentType`, value: contentType },
    ].filter(Boolean) as never
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getObject.mockReset();
});

describe.each([
  ["logo", getLogo, "image/png"],
  ["favicon", getFavicon, "image/x-icon"],
  ["background", getBackground, "image/png"],
])("GET /api/branding/%s (public serve route)", (name, handler, defaultType) => {
  it("404 when no storage key is configured", async () => {
    settingRows(name, null, null);
    expect((await handler()).status).toBe(404);
  });

  it("serves bytes with content-type and cache headers when configured", async () => {
    settingRows(name, "branding/x", "image/svg+xml");
    getObject.mockResolvedValue(Buffer.from([1, 2, 3]));
    const res = await handler();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(res.headers.get("Cache-Control")).toContain("max-age=3600");
    expect(getObject).toHaveBeenCalledWith("branding/x");
  });

  it(`falls back to ${defaultType} when content-type unset`, async () => {
    settingRows(name, "branding/x", null);
    getObject.mockResolvedValue(Buffer.from([9]));
    const res = await handler();
    expect(res.headers.get("Content-Type")).toBe(defaultType);
  });

  it("404 when the stored object is missing", async () => {
    settingRows(name, "branding/x", "image/png");
    getObject.mockRejectedValue(new StorageNotFoundError("gone"));
    expect((await handler()).status).toBe(404);
  });
});
