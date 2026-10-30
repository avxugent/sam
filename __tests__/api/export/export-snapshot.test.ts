import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/auth", () => ({ __esModule: true, auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: () => undefined })) }));
vi.mock("@/lib/audit", () => ({ __esModule: true, logAudit: vi.fn() }));
vi.mock("@/lib/export/snapshot", () => ({
  __esModule: true,
  buildInventorySnapshot: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { buildInventorySnapshot } from "@/lib/export/snapshot";
import { GET } from "@/app/api/export/snapshot/route";
import { NextRequest } from "next/server";

const mockAuth = vi.mocked(auth);
const mockBuild = vi.mocked(buildInventorySnapshot);
const mockLogAudit = vi.mocked(logAudit);

const SNAPSHOT = {
  generatedAt: "2026-07-09T10:00:00.000Z",
  counts: { assets: 2, locations: 1, suppliers: 1 },
  assets: [],
  suppliers: [],
  locations: [],
};

function req(bearer?: string) {
  return new NextRequest("http://localhost/api/export/snapshot", {
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  });
}

const ORIGINAL_TOKEN = process.env.EXPORT_TOKEN;

beforeEach(() => {
  vi.clearAllMocks();
  mockBuild.mockResolvedValue(SNAPSHOT as never);
  delete process.env.EXPORT_TOKEN;
});

afterEach(() => {
  if (ORIGINAL_TOKEN === undefined) delete process.env.EXPORT_TOKEN;
  else process.env.EXPORT_TOKEN = ORIGINAL_TOKEN;
});

describe("GET /api/export/snapshot", () => {
  it("401 without session or token", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await GET(req())).status).toBe(401);
  });

  it("403 for a session that still owes its second factor", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "VIEWER" }, needs2FA: true } as never);
    expect((await GET(req())).status).toBe(403);
    expect(mockBuild).not.toHaveBeenCalled();
  });

  it("403 for a non-admin session", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "MAINTAINER" } } as never);
    expect((await GET(req())).status).toBe(403);
    expect(mockBuild).not.toHaveBeenCalled();
  });

  it("200 with an admin session; logs an EXPORT audit entry with counts", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "ADMIN" } } as never);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain("sam-inventory-");
    const body = await res.json();
    expect(body.counts.assets).toBe(2);
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "EXPORT",
        entityType: "Inventory",
        detail: { assets: 2, locations: 1, suppliers: 1 },
      })
    );
  });

  it("200 with a valid EXPORT_TOKEN Bearer and no session", async () => {
    process.env.EXPORT_TOKEN = "tok";
    mockAuth.mockResolvedValue(null as never);
    const res = await GET(req("tok"));
    expect(res.status).toBe(200);
  });

  it("401 with a wrong Bearer token and no session", async () => {
    process.env.EXPORT_TOKEN = "tok";
    mockAuth.mockResolvedValue(null as never);
    expect((await GET(req("wrong"))).status).toBe(401);
  });
});
