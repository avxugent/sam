import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    asset: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    assetType: { findMany: vi.fn() },
    manufacturer: { findMany: vi.fn() },
    location: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { GET as healthGet } from "@/app/api/grafana/route";
import { POST as searchPost } from "@/app/api/grafana/search/route";
import { POST as queryPost } from "@/app/api/grafana/query/route";
import { POST as tagKeysPost } from "@/app/api/grafana/tag-keys/route";
import { POST as tagValuesPost } from "@/app/api/grafana/tag-values/route";

const VALID_TOKEN = "test-prom-token";

function makeReq(url: string, method: string, body?: object, token?: string) {
  return new NextRequest(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PROMETHEUS_SD_TOKEN", VALID_TOKEN);
});

// ── Health check ─────────────────────────────────────────────────────────────

describe("GET /api/grafana", () => {
  it("returns 401 without token", async () => {
    const res = await healthGet(makeReq("http://localhost/api/grafana", "GET"));
    expect(res.status).toBe(401);
  });

  it("returns 200 with valid token", async () => {
    const res = await healthGet(makeReq("http://localhost/api/grafana", "GET", undefined, VALID_TOKEN));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("ok");
  });
});

// ── Search ───────────────────────────────────────────────────────────────────

describe("POST /api/grafana/search", () => {
  it("returns 401 without token", async () => {
    const res = await searchPost(makeReq("http://localhost/api/grafana/search", "POST"));
    expect(res.status).toBe(401);
  });

  it("returns available target names", async () => {
    const res = await searchPost(makeReq("http://localhost/api/grafana/search", "POST", {}, VALID_TOKEN));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toContain("assets_table");
    expect(data).toContain("assets_by_type");
  });
});

// ── Query ────────────────────────────────────────────────────────────────────

describe("POST /api/grafana/query", () => {
  it("returns 401 without token", async () => {
    const res = await queryPost(makeReq("http://localhost/api/grafana/query", "POST"));
    expect(res.status).toBe(401);
  });

  it("returns table shape for assets_by_type", async () => {
    vi.mocked(prisma.asset.groupBy).mockResolvedValue([
      { typeId: "t1", _count: { id: 3 } } as never,
    ]);
    vi.mocked(prisma.assetType.findMany).mockResolvedValue([{ id: "t1", name: "Projector" }] as never);

    const res = await queryPost(makeReq("http://localhost/api/grafana/query", "POST", {
      targets: [{ target: "assets_by_type", type: "table" }],
      adhocFilters: [],
    }, VALID_TOKEN));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data[0]).toHaveProperty("columns");
    expect(data[0]).toHaveProperty("rows");
    expect(data[0].columns[0].text).toBe("Type");
  });

  it("returns table shape for assets_table", async () => {
    vi.mocked(prisma.asset.findMany).mockResolvedValue([
      {
        id: "a1",
        model: { name: "Dell XPS" },
        serialNumber: "SN1",
        hostname: "host1",
        installationDate: new Date("2020-01-01"),
        type: { name: "Laptop" },
        manufacturer: { name: "Dell" },
        location: { name: "Room 101" },
      } as never,
    ]);

    const res = await queryPost(makeReq("http://localhost/api/grafana/query", "POST", {
      targets: [{ target: "assets_table", type: "table" }],
      adhocFilters: [],
    }, VALID_TOKEN));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data[0].columns.map((c: { text: string }) => c.text)).toContain("Model");
    expect(data[0].rows[0]).toContain("Dell XPS");
  });

  it("returns empty table for unknown target", async () => {
    const res = await queryPost(makeReq("http://localhost/api/grafana/query", "POST", {
      targets: [{ target: "unknown_target" }],
      adhocFilters: [],
    }, VALID_TOKEN));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data[0].rows).toEqual([]);
  });

  it.each([
    ["targets is not an array", { targets: "assets_table" }],
    ["a target has no name", { targets: [{}] }],
    ["an ad-hoc filter has no value", { targets: [], adhocFilters: [{ key: "type", operator: "=" }] }],
  ])("returns 400 when %s", async (_label, body) => {
    const res = await queryPost(makeReq("http://localhost/api/grafana/query", "POST", body, VALID_TOKEN));
    expect(res.status).toBe(400);
  });
});

// ── Tag keys ─────────────────────────────────────────────────────────────────

describe("POST /api/grafana/tag-keys", () => {
  it("returns 401 without token", async () => {
    const res = await tagKeysPost(makeReq("http://localhost/api/grafana/tag-keys", "POST"));
    expect(res.status).toBe(401);
  });

  it("returns available filter keys", async () => {
    const res = await tagKeysPost(makeReq("http://localhost/api/grafana/tag-keys", "POST", {}, VALID_TOKEN));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.some((k: { text: string }) => k.text === "type")).toBe(true);
    expect(data.some((k: { text: string }) => k.text === "hostname")).toBe(true);
  });
});

// ── Tag values ───────────────────────────────────────────────────────────────

describe("POST /api/grafana/tag-values", () => {
  it("returns 401 without token", async () => {
    const res = await tagValuesPost(makeReq("http://localhost/api/grafana/tag-values", "POST"));
    expect(res.status).toBe(401);
  });

  it("returns type values", async () => {
    vi.mocked(prisma.assetType.findMany).mockResolvedValue([{ name: "Projector" }, { name: "Laptop" }] as never);
    const res = await tagValuesPost(makeReq("http://localhost/api/grafana/tag-values", "POST", { key: "type" }, VALID_TOKEN));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toContainEqual({ text: "Projector" });
  });

  it("returns empty array for unknown key", async () => {
    const res = await tagValuesPost(makeReq("http://localhost/api/grafana/tag-values", "POST", { key: "unknown" }, VALID_TOKEN));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual([]);
  });

  it("returns 400 when key is missing or not a string", async () => {
    const missing = await tagValuesPost(makeReq("http://localhost/api/grafana/tag-values", "POST", {}, VALID_TOKEN));
    const numeric = await tagValuesPost(makeReq("http://localhost/api/grafana/tag-values", "POST", { key: 1 }, VALID_TOKEN));
    expect(missing.status).toBe(400);
    expect(numeric.status).toBe(400);
  });
});
