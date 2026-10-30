import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { asset: { findMany: vi.fn() } } }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: () => undefined })) }));
vi.mock("@/lib/locations/path", () => ({
  getLocationAncestors: vi.fn(async () => [
    { id: "root", name: "Campus", fiNumber: null },
    { id: "l1", name: "Room 1", fiNumber: "AB.01.02.003" },
  ]),
  buildLocationPathString: vi.fn(() => "Campus > Room 1"),
  findFiNumber: vi.fn(() => "AB.01.02.003"),
  parseFiNumber: vi.fn(() => ({ campus: "AB", building: "01", floor: "02", room: "003" })),
}));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { GET } from "@/app/api/assets/by-hostname/route";

const mockAuth = vi.mocked(auth);
const findMany = vi.mocked(prisma.asset.findMany);

const req = (query: string, authorization?: string) =>
  new NextRequest(`http://localhost/api/assets/by-hostname${query}`, {
    headers: authorization ? { authorization } : {},
  });

const asset = {
  id: "a1",
  hostname: "pc1.example.com",
  locationId: "l1",
  model: { name: "XPS" },
  serialNumber: "SN1",
  installationDate: new Date("2024-05-06T10:00:00Z"),
  invoiceNumber: null,
  notes: null,
  type: { id: "t1", name: "Laptop" },
  manufacturer: { id: "m1", name: "Dell" },
  macAddresses: [{ id: "mac1", address: "AA:BB:CC:DD:EE:FF" }],
  customFields: [],
  location: { id: "l1", name: "Room 1", fiNumber: "AB.01.02.003", address: null, city: null, country: null },
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PROMETHEUS_SD_TOKEN = "sd-token";
  mockAuth.mockResolvedValue(null as never);
});
afterEach(() => {
  delete process.env.PROMETHEUS_SD_TOKEN;
});

describe("GET /api/assets/by-hostname", () => {
  it("401 with neither session nor token", async () => {
    expect((await GET(req("?hostname=x"))).status).toBe(401);
  });

  it("401 with a wrong Bearer token", async () => {
    expect((await GET(req("?hostname=x", "Bearer nope"))).status).toBe(401);
  });

  it("503 without a session when PROMETHEUS_SD_TOKEN is unset, like the other integration endpoints", async () => {
    delete process.env.PROMETHEUS_SD_TOKEN;
    expect((await GET(req("?hostname=x", "Bearer "))).status).toBe(503);
  });

  it("accepts a session cookie", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "VIEWER" } } as never);
    findMany.mockResolvedValue([] as never);
    expect((await GET(req("?hostname=x"))).status).toBe(200);
  });

  it("401 for a session that still owes its second factor", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", role: "VIEWER" }, needs2FA: true } as never);
    expect((await GET(req("?hostname=x"))).status).toBe(401);
  });

  it("400 without a hostname", async () => {
    expect((await GET(req("?hostname=%20", "Bearer sd-token"))).status).toBe(400);
  });

  it("returns installed assets enriched with their location path", async () => {
    findMany.mockResolvedValue([asset] as never);
    const res = await GET(req("?hostname=pc1.example.com", "Bearer sd-token"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(findMany.mock.calls[0][0]!.where).toEqual({ hostname: "pc1.example.com", status: "INSTALLED" });
    const [row] = await res.json();
    expect(row).toMatchObject({
      hostname: "pc1.example.com",
      model: "XPS",
      installationDate: "2024-05-06",
      macAddresses: ["AA:BB:CC:DD:EE:FF"],
      location: { path: "Campus > Room 1", fiNumberResolved: "AB.01.02.003", campus: "AB", room: "003" },
    });
    expect(row.location.ancestors).toHaveLength(2);
  });
});
