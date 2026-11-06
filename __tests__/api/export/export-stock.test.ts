import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/csv/export", () => ({ generateStockCsv: vi.fn() }));

import { auth } from "@/lib/auth";
import { generateStockCsv } from "@/lib/csv/export";

import { GET as exportStock } from "@/app/api/export/stock/route";

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
