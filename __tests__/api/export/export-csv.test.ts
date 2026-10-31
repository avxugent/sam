import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/csv/export", () => ({ generateActiveAssetsCsv: vi.fn() }));

import { auth } from "@/lib/auth";
import { generateActiveAssetsCsv } from "@/lib/csv/export";

import { GET as exportCsv } from "@/app/api/export/csv/route";

const mockAuth = vi.mocked(auth);
const session = (role = "ADMIN") => ({ user: { id: "u1", role, email: "a@b.com" } });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/export/csv", () => {
  function req(headers?: Record<string, string>) {
    return new NextRequest("http://localhost/api/export/csv", { headers });
  }
  it("401 when neither session nor export token present", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await exportCsv(req())).status).toBe(401);
  });
  it("403 for a non-admin session", async () => {
    mockAuth.mockResolvedValue(session("MAINTAINER") as never);
    expect((await exportCsv(req())).status).toBe(403);
    expect(generateActiveAssetsCsv).not.toHaveBeenCalled();
  });
  it("200 with a valid EXPORT_TOKEN and no session", async () => {
    process.env.EXPORT_TOKEN = "export-token";
    mockAuth.mockResolvedValue(null as never);
    vi.mocked(generateActiveAssetsCsv).mockResolvedValue("A");
    expect((await exportCsv(req({ authorization: "Bearer export-token" }))).status).toBe(200);
    delete process.env.EXPORT_TOKEN;
  });
  it("streams CSV with download headers for an admin", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    vi.mocked(generateActiveAssetsCsv).mockResolvedValue("A;B\r\n1;2");
    const res = await exportCsv(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toMatch(/attachment; filename="sam-export-\d{4}-\d{2}-\d{2}\.csv"/);
    expect(await res.text()).toBe("A;B\r\n1;2");
  });
});
