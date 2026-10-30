import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { appSetting: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() } },
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
const putObject = vi.fn();
const deleteObject = vi.fn();
vi.mock("@/lib/storage", async () => ({
  ...(await vi.importActual<typeof import("@/lib/storage")>("@/lib/storage")),
  getStorageDriver: () => ({ getObject: vi.fn(), putObject, deleteObject }),
  StorageNotFoundError: class extends Error {},
}));

import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { removeBrandingAsset, uploadBrandingAsset } from "@/lib/branding/assets";

const session = { user: { id: "u1", role: "ADMIN" } } as never;

// jsdom's File does not survive a real multipart round-trip, so stub formData().
function uploadReq(file: { type: string; size: number } | null) {
  const fake = file && {
    type: file.type,
    arrayBuffer: async () => new ArrayBuffer(file.size),
  };
  return { formData: async () => ({ get: () => fake }) } as unknown as Request;
}

beforeEach(() => vi.clearAllMocks());

describe("uploadBrandingAsset()", () => {
  it("400 when no file is sent", async () => {
    const res = await uploadBrandingAsset(uploadReq(null), session, "logo");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "No file provided" });
  });

  it("400 for a MIME type outside the asset allowlist", async () => {
    const res = await uploadBrandingAsset(uploadReq({ type: "image/jpeg", size: 10 }), session, "favicon");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid file type. Allowed: ICO, PNG, SVG");
  });

  it("400 when the file exceeds the asset size limit", async () => {
    const res = await uploadBrandingAsset(uploadReq({ type: "image/png", size: 1024 * 1024 + 1 }), session, "favicon");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("File too large. Maximum size is 1 MB");
    expect(putObject).not.toHaveBeenCalled();
  });

  it("stores the file, records settings and audits", async () => {
    const res = await uploadBrandingAsset(uploadReq({ type: "image/webp", size: 10 }), session, "logo");
    expect(res.status).toBe(200);
    expect(putObject).toHaveBeenCalledWith("branding/logo", expect.any(Buffer), "image/webp");
    const keys = vi.mocked(prisma.appSetting.upsert).mock.calls.map(([arg]) => arg.where.key);
    expect(keys).toEqual(["branding.logoStorageKey", "branding.logoContentType"]);
    expect(vi.mocked(logAudit).mock.calls[0][0].detail).toEqual({ event: "Logo uploaded", contentType: "image/webp" });
  });

  it("also switches the background mode to custom for the background asset", async () => {
    await uploadBrandingAsset(uploadReq({ type: "image/png", size: 10 }), session, "background");
    const upserts = vi.mocked(prisma.appSetting.upsert).mock.calls.map(([arg]) => [arg.where.key, arg.update.value]);
    expect(upserts).toContainEqual(["branding.backgroundMode", "custom"]);
  });
});

describe("storage failures", () => {
  it("upload: 502 and no settings written", async () => {
    putObject.mockRejectedValueOnce(new Error("disk full"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await uploadBrandingAsset(uploadReq({ type: "image/webp", size: 10 }), session, "logo");
    expect(res.status).toBe(502);
    expect(prisma.appSetting.upsert).not.toHaveBeenCalled();
  });

  it("remove: 502 and the settings are kept for a retry", async () => {
    deleteObject.mockRejectedValueOnce(new Error("S3 down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await removeBrandingAsset(new Request("http://x"), session, "logo");
    expect(res.status).toBe(502);
    expect(prisma.appSetting.deleteMany).not.toHaveBeenCalled();
  });
});

describe("removeBrandingAsset()", () => {
  it("deletes the object and every related setting", async () => {
    const res = await removeBrandingAsset(new Request("http://x"), session, "background");
    expect(res.status).toBe(200);
    expect(deleteObject).toHaveBeenCalledWith("branding/background");
    const keys = vi.mocked(prisma.appSetting.deleteMany).mock.calls.map(([arg]) => arg?.where?.key);
    expect(keys).toEqual(["branding.backgroundStorageKey", "branding.backgroundContentType", "branding.backgroundMode"]);
    expect(vi.mocked(logAudit).mock.calls[0][0].detail).toEqual({ event: "Background image removed" });
  });
});
