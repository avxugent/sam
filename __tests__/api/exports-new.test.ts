import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/csv/export", () => ({
  generateDecommissionedCsv: vi.fn(),
  generateStockCsv: vi.fn(),
}));
vi.mock("@/lib/hostname/compliance", () => ({ computeHostnameCompliance: vi.fn() }));

import { auth } from "@/lib/auth";
import { generateDecommissionedCsv, generateStockCsv } from "@/lib/csv/export";
import { computeHostnameCompliance } from "@/lib/hostname/compliance";

import { GET as exportDecommissioned } from "@/app/api/export/decommissioned/route";
import { GET as exportStock } from "@/app/api/export/stock/route";
import { GET as exportCompliance } from "@/app/api/compliance/hostname/export/route";

const mockAuth = vi.mocked(auth);
const session = (role = "ADMIN") => ({ user: { id: "u1", role, email: "a@b.com" } });

const ORIGINAL_TOKEN = process.env.EXPORT_TOKEN;
beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.EXPORT_TOKEN;
});
afterEach(() => {
  if (ORIGINAL_TOKEN === undefined) delete process.env.EXPORT_TOKEN;
  else process.env.EXPORT_TOKEN = ORIGINAL_TOKEN;
});

const withToken = (url: string, token: string) =>
  new NextRequest(url, { headers: { authorization: `Bearer ${token}` } });

describe("GET /api/export/decommissioned", () => {
  const req = () => new NextRequest("http://localhost/api/export/decommissioned");
  it("200 with a valid EXPORT_TOKEN and no session", async () => {
    process.env.EXPORT_TOKEN = "tok";
    mockAuth.mockResolvedValue(null as never);
    vi.mocked(generateDecommissionedCsv).mockResolvedValue("X");
    expect((await exportDecommissioned(withToken("http://localhost/api/export/decommissioned", "tok"))).status).toBe(200);
  });
  it("401 with a wrong EXPORT_TOKEN and no session", async () => {
    process.env.EXPORT_TOKEN = "tok";
    mockAuth.mockResolvedValue(null as never);
    expect((await exportDecommissioned(withToken("http://localhost/api/export/decommissioned", "nope"))).status).toBe(401);
  });
  it("401 unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await exportDecommissioned(req())).status).toBe(401);
  });
  it("403 for a non-admin", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    expect((await exportDecommissioned(req())).status).toBe(403);
  });
  it("streams CSV with download headers for an admin", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    vi.mocked(generateDecommissionedCsv).mockResolvedValue("A;B\r\n1;2");
    const res = await exportDecommissioned(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toMatch(/filename="sam-decommissioned-\d{4}-\d{2}-\d{2}\.csv"/);
    expect(await res.text()).toBe("A;B\r\n1;2");
  });
});

describe("GET /api/export/stock", () => {
  const req = () => new NextRequest("http://localhost/api/export/stock");
  it("200 with a valid EXPORT_TOKEN and no session", async () => {
    process.env.EXPORT_TOKEN = "tok";
    mockAuth.mockResolvedValue(null as never);
    vi.mocked(generateStockCsv).mockResolvedValue("X");
    expect((await exportStock(withToken("http://localhost/api/export/stock", "tok"))).status).toBe(200);
  });
  it("401 with a wrong EXPORT_TOKEN and no session", async () => {
    process.env.EXPORT_TOKEN = "tok";
    mockAuth.mockResolvedValue(null as never);
    expect((await exportStock(withToken("http://localhost/api/export/stock", "nope"))).status).toBe(401);
  });
  it("401 unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await exportStock(req())).status).toBe(401);
  });
  it("403 for a non-admin", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    expect((await exportStock(req())).status).toBe(403);
  });
  it("streams CSV with download headers for an admin", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    vi.mocked(generateStockCsv).mockResolvedValue("TYPE;MODEL\r\nLaptop;X");
    const res = await exportStock(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toMatch(/filename="sam-stock-\d{4}-\d{2}-\d{2}\.csv"/);
    expect(await res.text()).toBe("TYPE;MODEL\r\nLaptop;X");
  });
});

describe("GET /api/compliance/hostname/export", () => {
  const req = () => new NextRequest("http://localhost/api/compliance/hostname/export");
  it("401 unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await exportCompliance(req())).status).toBe(401);
  });
  it("403 for a non-admin", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    expect((await exportCompliance(req())).status).toBe(403);
  });
  it("emits a CSV of non-compliant assets for an admin", async () => {
    mockAuth.mockResolvedValue(session("ADMIN") as never);
    vi.mocked(computeHostnameCompliance).mockResolvedValue({
      types: [
        {
          typeId: "t1",
          typeName: "Web",
          pattern: "^web-",
          measured: 2,
          compliant: 1,
          nonCompliant: 1,
          noHostname: 0,
          rate: 0.5,
          nonCompliantAssets: [
            { id: "a1", hostname: "bad-host", model: "m", serialNumber: "sn", locationPath: "Campus A - Room 1", fiNumber: "14.10.100.013" },
          ],
        },
        {
          // pattern null + all-null asset fields + a value needing CSV escaping.
          typeId: "t2",
          typeName: "Mic; Audio",
          pattern: null,
          measured: 1,
          compliant: 0,
          nonCompliant: 1,
          noHostname: 0,
          rate: 0,
          nonCompliantAssets: [
            { id: "a2", hostname: "orphan", model: null, serialNumber: null, locationPath: null, fiNumber: null },
          ],
        },
      ],
      overall: { measured: 3, compliant: 1, nonCompliant: 2, rate: 1 / 3 },
    } as never);

    const res = await exportCompliance(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toMatch(/filename="sam-hostname-noncompliant-\d{4}-\d{2}-\d{2}\.csv"/);
    const body = await res.text();
    const lines = body.split("\r\n");
    expect(lines[0]).toBe("TYPE;PATTERN;HOSTNAME;MODEL;SERIAL;LOCATION;FI_NUMBER");
    expect(lines[1]).toBe("Web;^web-;bad-host;m;sn;Campus A - Room 1;14.10.100.013");
    // Type name with a semicolon is quoted; null fields render as empty cells.
    expect(lines[2]).toBe('"Mic; Audio";;orphan;;;;');
  });
});
