import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  prisma: {
    appSetting: { findUnique: vi.fn() },
    auditLog: { findMany: vi.fn() },
  },
}));

const getObject = vi.fn();
vi.mock("@/lib/storage", () => {
  class StorageNotFoundError extends Error {}
  return {
    getStorageDriver: () => ({ getObject, putObject: vi.fn(), deleteObject: vi.fn() }),
    StorageNotFoundError,
  };
});

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StorageNotFoundError } from "@/lib/storage";
import { GET as getLogo } from "@/app/api/branding/logo/route";
import { GET as getFavicon } from "@/app/api/branding/favicon/route";
import { GET as getBackground } from "@/app/api/branding/background/route";
import { GET as getAuditLogs } from "@/app/api/audit-logs/route";

const mockAuth = vi.mocked(auth);
const mockSetting = vi.mocked(prisma.appSetting.findUnique);
const mockAuditFind = vi.mocked(prisma.auditLog.findMany);

beforeEach(() => {
  vi.clearAllMocks();
  getObject.mockReset();
});

describe.each([
  ["logo", getLogo, "image/png"],
  ["favicon", getFavicon, "image/x-icon"],
  ["background", getBackground, "image/png"],
])("GET /api/branding/%s (public serve route)", (_name, handler, defaultType) => {
  it("404 when no storage key is configured", async () => {
    mockSetting.mockResolvedValue(null as never);
    expect((await handler()).status).toBe(404);
  });

  it("serves bytes with content-type and cache headers when configured", async () => {
    mockSetting
      .mockResolvedValueOnce({ value: "branding/x" } as never) // storage key
      .mockResolvedValueOnce({ value: "image/svg+xml" } as never); // content type
    getObject.mockResolvedValue(Buffer.from([1, 2, 3]));
    const res = await handler();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(res.headers.get("Cache-Control")).toContain("max-age=3600");
  });

  it(`falls back to ${defaultType} when content-type unset`, async () => {
    mockSetting
      .mockResolvedValueOnce({ value: "branding/x" } as never)
      .mockResolvedValueOnce(null as never);
    getObject.mockResolvedValue(Buffer.from([9]));
    const res = await handler();
    expect(res.headers.get("Content-Type")).toBe(defaultType);
  });

  it("404 when the stored object is missing", async () => {
    mockSetting
      .mockResolvedValueOnce({ value: "branding/x" } as never)
      .mockResolvedValueOnce({ value: "image/png" } as never);
    getObject.mockRejectedValue(new StorageNotFoundError("gone"));
    expect((await handler()).status).toBe(404);
  });
});

describe("GET /api/audit-logs", () => {
  function req(qs = "") {
    return new NextRequest(`http://localhost/api/audit-logs${qs}`);
  }
  const admin = { user: { id: "u1", role: "ADMIN", email: "a@b.com" } };

  it("401 unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await getAuditLogs(req())).status).toBe(401);
  });

  it("403 for non-admin", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u2", role: "EDITOR" } } as never);
    expect((await getAuditLogs(req())).status).toBe(403);
  });

  it("returns logs with no filters (default limit)", async () => {
    mockAuth.mockResolvedValue(admin as never);
    mockAuditFind.mockResolvedValue([{ id: "l1" }] as never);
    const res = await getAuditLogs(req());
    expect(res.status).toBe(200);
    expect(mockAuditFind).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, orderBy: { timestamp: "desc" }, take: 500 })
    );
  });

  it("applies action/entityType/userId and date-range filters", async () => {
    mockAuth.mockResolvedValue(admin as never);
    mockAuditFind.mockResolvedValue([] as never);
    await getAuditLogs(req("?action=CREATE&entityType=Asset&userId=u9&from=2024-01-01&to=2024-02-01"));
    const arg = mockAuditFind.mock.calls[0][0];
    expect(arg.where).toMatchObject({ action: "CREATE", entityType: "Asset", userId: "u9" });
    expect(arg.where.timestamp.gte).toBeInstanceOf(Date);
    expect(arg.where.timestamp.lte).toBeInstanceOf(Date);
  });

  it("caps the limit at 1000", async () => {
    mockAuth.mockResolvedValue(admin as never);
    mockAuditFind.mockResolvedValue([] as never);
    await getAuditLogs(req("?limit=99999"));
    expect(mockAuditFind).toHaveBeenCalledWith(expect.objectContaining({ take: 1000 }));
  });

  it.each(["?limit=abc", "?limit=0", "?from=not-a-date", "?to=2024-13-45"])("400 for an invalid query (%s)", async (qs) => {
    mockAuth.mockResolvedValue(admin as never);
    expect((await getAuditLogs(req(qs))).status).toBe(400);
    expect(mockAuditFind).not.toHaveBeenCalled();
  });
});
