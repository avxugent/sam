import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  prisma: {
    asset: { findMany: vi.fn(), groupBy: vi.fn() },
    assetType: { findMany: vi.fn() },
    manufacturer: { findMany: vi.fn() },
    location: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { POST as queryPost } from "@/app/api/grafana/query/route";

const TOKEN = "tok";
function req(body: object) {
  return new NextRequest("http://localhost/api/grafana/query", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PROMETHEUS_SD_TOKEN", TOKEN);
});

describe("POST /api/grafana/query — target branches", () => {
  it("401 without a valid token", async () => {
    const res = await queryPost(new NextRequest("http://localhost/api/grafana/query", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
  });

  it("assets_by_manufacturer maps ids and falls back to Unknown / No manufacturer", async () => {
    vi.mocked(prisma.asset.groupBy).mockResolvedValue([
      { manufacturerId: "m1", _count: { id: 3 } },
      { manufacturerId: "mX", _count: { id: 1 } },
      { manufacturerId: null, _count: { id: 2 } },
    ] as never);
    vi.mocked(prisma.manufacturer.findMany).mockResolvedValue([{ id: "m1", name: "Dell" }] as never);
    const res = await queryPost(req({ targets: [{ target: "assets_by_manufacturer" }], adhocFilters: [] }));
    const [out] = await res.json();
    expect(out.rows).toEqual([["Dell", 3], ["Unknown", 1], ["No manufacturer", 2]]);
  });

  it("assets_by_location maps ids and falls back to Unknown", async () => {
    vi.mocked(prisma.asset.groupBy).mockResolvedValue([
      { locationId: "l1", _count: { id: 4 } },
      { locationId: "lX", _count: { id: 1 } },
    ] as never);
    vi.mocked(prisma.location.findMany).mockResolvedValue([{ id: "l1", name: "Room 1" }] as never);
    const res = await queryPost(req({ targets: [{ target: "assets_by_location" }], adhocFilters: [] }));
    const [out] = await res.json();
    expect(out.rows).toEqual([["Room 1", 4], ["Unknown", 1]]);
  });

  it("assets_by_install_year buckets by year", async () => {
    vi.mocked(prisma.asset.findMany).mockResolvedValue([
      { installationDate: new Date("2022-05-01") },
      { installationDate: new Date("2022-09-01") },
      { installationDate: new Date("2023-01-01") },
    ] as never);
    const res = await queryPost(req({ targets: [{ target: "assets_by_install_year" }], adhocFilters: [] }));
    const [out] = await res.json();
    expect(out.rows).toEqual([["2022", 2], ["2023", 1]]);
  });

  it("applies adhoc filters for all supported keys (assets_table)", async () => {
    vi.mocked(prisma.asset.findMany).mockResolvedValue([] as never);
    const res = await queryPost(req({
      targets: [{ target: "assets_table" }],
      adhocFilters: [
        { key: "hostname", operator: "=", value: "h1" },
        { key: "type", operator: "=", value: "Laptop" },
        { key: "manufacturer", operator: "=", value: "Dell" },
        { key: "location", operator: "=", value: "Room 1" },
        { key: "ignored", operator: "!=", value: "x" },
      ],
    }));
    expect(res.status).toBe(200);
    const whereArg = vi.mocked(prisma.asset.findMany).mock.calls[0][0].where;
    expect(whereArg.AND).toHaveLength(5);
    expect(whereArg.AND).toContainEqual({ status: "INSTALLED" });
  });

  it("excludes decommissioned assets even with no adhoc filters", async () => {
    vi.mocked(prisma.asset.findMany).mockResolvedValue([] as never);
    await queryPost(req({ targets: [{ target: "assets_table" }], adhocFilters: [] }));
    const whereArg = vi.mocked(prisma.asset.findMany).mock.calls[0][0].where;
    expect(whereArg).toEqual({ AND: [{ status: "INSTALLED" }] });
  });

  it("returns an empty table for an unknown target", async () => {
    const res = await queryPost(req({ targets: [{ target: "nope" }], adhocFilters: [] }));
    const [out] = await res.json();
    expect(out.columns).toEqual([]);
    expect(out.rows).toEqual([]);
  });

  it("handles an empty targets array", async () => {
    const res = await queryPost(req({ adhocFilters: [] }));
    expect(await res.json()).toEqual([]);
  });
});
