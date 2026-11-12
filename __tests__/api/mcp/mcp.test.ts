import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    location: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
    asset: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(), groupBy: vi.fn() },
    stockItem: { findMany: vi.fn(), count: vi.fn() },
    model: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
    assetType: { findMany: vi.fn() },
    manufacturer: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/tokens/api-key", () => ({ apiKeyUser: vi.fn() }));
vi.mock("@/lib/locations/path", () => ({
  getAllDescendantLocationIds: vi.fn(),
  getAncestorChainsBatch: vi.fn(),
  getLocationAncestors: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { apiKeyUser } from "@/lib/tokens/api-key";
import { getAllDescendantLocationIds, getAncestorChainsBatch, getLocationAncestors } from "@/lib/locations/path";
import { DELETE, GET, POST } from "@/app/api/mcp/route";

const mockKey = vi.mocked(apiKeyUser);
let nextId = 1;

function rpc(method: string, params?: unknown) {
  return new NextRequest("http://localhost/api/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: "Bearer sam_mcp_x" },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
  });
}

async function callTool(name: string, args: object = {}) {
  const res = await POST(rpc("tools/call", { name, arguments: args }));
  expect(res.status).toBe(200);
  const { result, error } = await res.json();
  expect(error).toBeUndefined();
  return { isError: result.isError === true, data: result.isError ? result.content[0].text : JSON.parse(result.content[0].text) };
}

const room = { id: "l2", name: "Room 1" };
const assetRow = {
  id: "a1",
  hostname: "host1",
  serialNumber: "SN1",
  status: "INSTALLED",
  quantity: 1,
  installationDate: new Date("2025-01-02"),
  type: { name: "Camera" },
  manufacturer: { name: "Acme" },
  model: { id: "m1", name: "Cam X" },
  location: room,
  vaultPath: "secret/data/av/host1",
  notes: "private",
  invoiceNumber: "INV-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockKey.mockResolvedValue({ user: { id: "u1", name: "T", role: "VIEWER" }, keyId: "k1" } as never);
});

describe("POST /api/mcp transport and auth", () => {
  it("returns the 401 of a bad key without running the protocol", async () => {
    mockKey.mockResolvedValue({ error: new Response("no", { status: 401 }) } as never);
    expect((await POST(rpc("tools/list"))).status).toBe(401);
  });

  it("405 for GET and DELETE (stateless, no SSE stream)", async () => {
    expect((await GET()).status).toBe(405);
    expect((await DELETE()).status).toBe(405);
  });

  it("answers initialize", async () => {
    const res = await POST(rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "1" } }));
    const body = await res.json();
    expect(body.result.serverInfo.name).toBe("sam");
    expect(body.result.capabilities.tools).toBeDefined();
  });

  it("lists only read-only tools", async () => {
    const body = await (await POST(rpc("tools/list"))).json();
    const tools: { name: string; annotations: { readOnlyHint: boolean } }[] = body.result.tools;
    expect(tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(["get_location_tree", "list_assets_by_location", "list_assets_by_model", "find_asset", "get_asset"])
    );
    expect(tools.every((t) => t.annotations.readOnlyHint)).toBe(true);
  });
});

describe("tools", () => {
  it("get_location_tree nests the flat list and respects rootId and maxDepth", async () => {
    vi.mocked(prisma.location.findMany).mockResolvedValue([
      { id: "c", name: "Campus", parentId: null, fiNumber: "14", _count: { assets: 0, stockItems: 0 } },
      { id: "b", name: "Building", parentId: "c", fiNumber: null, _count: { assets: 1, stockItems: 2 } },
      { id: "r", name: "Room", parentId: "b", fiNumber: null, _count: { assets: 3, stockItems: 0 } },
    ] as never);

    const full = await callTool("get_location_tree");
    expect(full.data[0].children[0].children[0]).toMatchObject({ id: "r", assets: 3, childCount: 0 });
    expect(full.data[0]).not.toHaveProperty("parentId");

    const shallow = await callTool("get_location_tree", { maxDepth: 1 });
    expect(shallow.data[0]).toMatchObject({ id: "c", childCount: 1 });
    expect(shallow.data[0]).not.toHaveProperty("children");

    expect((await callTool("get_location_tree", { rootId: "b" })).data.id).toBe("b");
    const missing = await callTool("get_location_tree", { rootId: "nope" });
    expect(missing).toMatchObject({ isError: true });
  });

  it("find_locations returns paths", async () => {
    vi.mocked(prisma.location.findMany).mockResolvedValue([{ id: "r", name: "Room", fiNumber: "1" }] as never);
    vi.mocked(prisma.location.count).mockResolvedValue(1 as never);
    vi.mocked(getAncestorChainsBatch).mockResolvedValue(new Map([["r", { ids: ["c", "r"], names: ["Campus", "Room"] }]]));
    expect((await callTool("find_locations", { q: "Room" })).data.items[0].path).toBe("Campus / Room");
  });

  it("get_location adds the path and the inherited FI number", async () => {
    vi.mocked(prisma.location.findUnique).mockResolvedValue({
      id: "r", name: "Room", fiNumber: null, children: [], _count: { assets: 2, stockItems: 0 },
    } as never);
    vi.mocked(getLocationAncestors).mockResolvedValue([
      { id: "c", name: "Campus", fiNumber: "14" },
      { id: "r", name: "Room", fiNumber: null },
    ]);
    expect((await callTool("get_location", { locationId: "r" })).data).toMatchObject({ path: "Campus / Room", fiNumber: "14", assets: 2 });

    vi.mocked(prisma.location.findUnique).mockResolvedValue(null as never);
    expect((await callTool("get_location", { locationId: "x" })).isError).toBe(true);
  });

  it("list_assets_by_location includes descendants and never leaks sensitive fields", async () => {
    vi.mocked(prisma.location.findUnique).mockResolvedValue({ id: "l1" } as never);
    vi.mocked(getAllDescendantLocationIds).mockResolvedValue(["l2"]);
    vi.mocked(prisma.asset.findMany).mockResolvedValue([assetRow] as never);
    vi.mocked(prisma.asset.count).mockResolvedValue(1 as never);

    const { data } = await callTool("list_assets_by_location", { locationId: "l1" });
    expect(data).toMatchObject({ total: 1, hasMore: false });
    expect(data.items[0]).toMatchObject({ hostname: "host1", model: "Cam X", installationDate: "2025-01-02" });
    expect(JSON.stringify(data)).not.toMatch(/vaultPath|secret\/data|private|INV-1/);
    expect(vi.mocked(prisma.asset.findMany).mock.calls[0][0]!.where).toEqual({ locationId: { in: ["l1", "l2"] }, status: "INSTALLED" });
  });

  it("list_assets_by_location without descendants or status filter, and unknown location", async () => {
    vi.mocked(prisma.location.findUnique).mockResolvedValue({ id: "l1" } as never);
    vi.mocked(prisma.asset.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.asset.count).mockResolvedValue(0 as never);
    await callTool("list_assets_by_location", { locationId: "l1", includeDescendants: false, status: "ALL" });
    expect(getAllDescendantLocationIds).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.asset.findMany).mock.calls[0][0]!.where).toEqual({ locationId: { in: ["l1"] } });

    vi.mocked(prisma.location.findUnique).mockResolvedValue(null as never);
    expect((await callTool("list_assets_by_location", { locationId: "nope" })).isError).toBe(true);
  });

  it("reports hasMore when a page is cut", async () => {
    vi.mocked(prisma.location.findUnique).mockResolvedValue({ id: "l1" } as never);
    vi.mocked(getAllDescendantLocationIds).mockResolvedValue([]);
    vi.mocked(prisma.asset.findMany).mockResolvedValue([assetRow] as never);
    vi.mocked(prisma.asset.count).mockResolvedValue(5 as never);
    expect((await callTool("list_assets_by_location", { locationId: "l1", limit: 1 })).data).toMatchObject({ hasMore: true, limit: 1 });
  });

  it("rejects an oversized limit", async () => {
    const res = await POST(rpc("tools/call", { name: "list_assets_by_location", arguments: { locationId: "l1", limit: 5000 } }));
    const { result, error } = await res.json();
    expect(error || result?.isError).toBeTruthy();
  });

  it("list_stock_by_location", async () => {
    vi.mocked(prisma.location.findUnique).mockResolvedValue({ id: "l1" } as never);
    vi.mocked(getAllDescendantLocationIds).mockResolvedValue([]);
    vi.mocked(prisma.stockItem.findMany).mockResolvedValue([
      { id: "s1", serialNumber: null, quantity: 4, type: { name: "Cable" }, manufacturer: null, model: { id: "m2", name: "HDMI" }, location: { id: "l1", name: "Store" }, notes: "x" },
    ] as never);
    vi.mocked(prisma.stockItem.count).mockResolvedValue(1 as never);
    const { data } = await callTool("list_stock_by_location", { locationId: "l1" });
    expect(data.items[0]).toMatchObject({ model: "HDMI", quantity: 4 });
    expect(data.items[0]).not.toHaveProperty("notes");

    vi.mocked(prisma.location.findUnique).mockResolvedValue(null as never);
    expect((await callTool("list_stock_by_location", { locationId: "x" })).isError).toBe(true);
  });

  it("list_models filters by name", async () => {
    vi.mocked(prisma.model.findMany).mockResolvedValue([{ id: "m1", name: "Cam X" }] as never);
    vi.mocked(prisma.model.count).mockResolvedValue(1 as never);
    await callTool("list_models", { q: "Cam", typeId: "t1", manufacturerId: "mf1" });
    expect(vi.mocked(prisma.model.findMany).mock.calls[0][0]!.where).toEqual({ name: { contains: "Cam" }, typeId: "t1", manufacturerId: "mf1" });
  });

  it("list_assets_by_model totals units per location", async () => {
    vi.mocked(prisma.model.findUnique).mockResolvedValue({ id: "m1", name: "Cam X", manufacturer: { name: "Acme" }, type: { name: "Camera" } } as never);
    vi.mocked(prisma.asset.findMany).mockResolvedValue([assetRow] as never);
    vi.mocked(prisma.asset.count).mockResolvedValue(3 as never);
    vi.mocked(prisma.asset.groupBy).mockResolvedValue([
      { locationId: "l2", _sum: { quantity: 2 } },
      { locationId: "l1", _sum: { quantity: 1 } },
    ] as never);
    vi.mocked(prisma.location.findMany).mockResolvedValue([{ id: "l1", name: "A room" }, { id: "l2", name: "B room" }] as never);

    const { data } = await callTool("list_assets_by_model", { modelId: "m1" });
    expect(data).toMatchObject({ totalUnits: 3, total: 3, model: { name: "Cam X", manufacturer: "Acme" } });
    expect(data.byLocation.map((l: { location: string }) => l.location)).toEqual(["A room", "B room"]);

    vi.mocked(prisma.model.findUnique).mockResolvedValue(null as never);
    expect((await callTool("list_assets_by_model", { modelId: "nope" })).isError).toBe(true);
  });

  it("find_asset matches hostname, serial and a normalised MAC address", async () => {
    vi.mocked(prisma.asset.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.asset.count).mockResolvedValue(0 as never);
    await callTool("find_asset", { q: "AA:BB:CC:DD:EE:FF" });
    const where = vi.mocked(prisma.asset.findMany).mock.calls[0][0]!.where as { OR: unknown[] };
    expect(where.OR).toHaveLength(3);

    await callTool("find_asset", { q: "host" });
    expect((vi.mocked(prisma.asset.findMany).mock.calls[1][0]!.where as { OR: unknown[] }).OR).toHaveLength(2);
  });

  it("get_asset returns detail with the location path, without the Vault path", async () => {
    vi.mocked(prisma.asset.findUnique).mockResolvedValue({
      ...assetRow,
      warrantyMonths: 36,
      endOfSupportDate: null,
      criticality: null,
      supplier: { name: "Sup" },
      macAddresses: [{ address: "AA:BB:CC:DD:EE:FF" }],
      customFields: [{ key: "rack", value: "R1" }],
    } as never);
    vi.mocked(getLocationAncestors).mockResolvedValue([{ id: "c", name: "Campus", fiNumber: null }, { id: "l2", name: "Room 1", fiNumber: null }]);

    const { data } = await callTool("get_asset", { assetId: "a1" });
    expect(data).toMatchObject({ locationPath: "Campus / Room 1", supplier: "Sup", macAddresses: ["AA:BB:CC:DD:EE:FF"], customFields: { rack: "R1" } });
    expect(JSON.stringify(data)).not.toMatch(/vaultPath|secret\/data|private/);

    vi.mocked(prisma.asset.findUnique).mockResolvedValue(null as never);
    expect((await callTool("get_asset", { assetId: "nope" })).isError).toBe(true);
  });

  it("list_asset_types and list_manufacturers", async () => {
    vi.mocked(prisma.assetType.findMany).mockResolvedValue([{ id: "t1", name: "Camera" }] as never);
    vi.mocked(prisma.manufacturer.findMany).mockResolvedValue([{ id: "mf1", name: "Acme" }] as never);
    expect((await callTool("list_asset_types")).data).toEqual([{ id: "t1", name: "Camera" }]);
    expect((await callTool("list_manufacturers")).data).toEqual([{ id: "mf1", name: "Acme" }]);
  });
});
