import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
    assetType: { findMany: vi.fn() },
    manufacturer: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { getModelItems, getModelClusters } from "@/lib/model-clusters";

const mockQueryRaw = vi.mocked(prisma.$queryRaw);
const mockTypes = vi.mocked(prisma.assetType.findMany);
const mockManufacturers = vi.mocked(prisma.manufacturer.findMany);

beforeEach(() => vi.clearAllMocks());

describe("getModelItems()", () => {
  it("attaches distinct type/manufacturer names to each raw model spelling", async () => {
    mockQueryRaw.mockResolvedValue([
      { model: "PowerEdge R740", typeId: "t1", manufacturerId: "m1", count: BigInt(5) },
      { model: "HPE ProLiant DL380", typeId: "t1", manufacturerId: "m2", count: BigInt(3) },
    ] as never);
    mockTypes.mockResolvedValue([{ id: "t1", name: "Server" }] as never);
    mockManufacturers.mockResolvedValue([
      { id: "m1", name: "Dell" },
      { id: "m2", name: "HPE" },
    ] as never);

    const items = await getModelItems();
    expect(items).toEqual([
      { model: "PowerEdge R740", count: 5, types: ["Server"], manufacturers: ["Dell"] },
      { model: "HPE ProLiant DL380", count: 3, types: ["Server"], manufacturers: ["HPE"] },
    ]);
  });

  it("merges counts and unions type/manufacturer names for the same raw spelling across typeId/manufacturerId combos", async () => {
    mockQueryRaw.mockResolvedValue([
      { model: "PowerEdge R740", typeId: "t1", manufacturerId: "m1", count: BigInt(5) },
      { model: "PowerEdge R740", typeId: "t2", manufacturerId: "m1", count: BigInt(1) },
    ] as never);
    mockTypes.mockResolvedValue([
      { id: "t1", name: "Server" },
      { id: "t2", name: "Rack Unit" },
    ] as never);
    mockManufacturers.mockResolvedValue([{ id: "m1", name: "Dell" }] as never);

    const items = await getModelItems();
    expect(items).toEqual([
      { model: "PowerEdge R740", count: 6, types: ["Rack Unit", "Server"], manufacturers: ["Dell"] },
    ]);
  });

  it("returns empty types/manufacturers when typeId/manufacturerId are null", async () => {
    mockQueryRaw.mockResolvedValue([
      { model: "PowerEdge R740", typeId: null, manufacturerId: null, count: BigInt(5) },
    ] as never);
    mockTypes.mockResolvedValue([] as never);
    mockManufacturers.mockResolvedValue([] as never);

    const items = await getModelItems();
    expect(items).toEqual([{ model: "PowerEdge R740", count: 5, types: [], manufacturers: [] }]);
  });

  it("groups by BINARY model so the DB's case-insensitive collation can't merge case-only variants before they reach clustering", async () => {
    mockQueryRaw.mockResolvedValue([] as never);
    mockTypes.mockResolvedValue([] as never);
    mockManufacturers.mockResolvedValue([] as never);

    await getModelItems();

    const sql = mockQueryRaw.mock.calls[0][0] as unknown as TemplateStringsArray;
    expect(sql.join("")).toMatch(/GROUP BY\s+BINARY model/);
  });
});

describe("getModelClusters()", () => {
  it("groups similar spellings computed from getModelItems()", async () => {
    mockQueryRaw.mockResolvedValue([
      { model: "PowerEdge R740", typeId: "t1", manufacturerId: "m1", count: BigInt(5) },
      { model: "poweredge r740", typeId: "t1", manufacturerId: "m1", count: BigInt(2) },
      { model: "HPE ProLiant DL380", typeId: "t1", manufacturerId: "m2", count: BigInt(3) },
    ] as never);
    mockTypes.mockResolvedValue([{ id: "t1", name: "Server" }] as never);
    mockManufacturers.mockResolvedValue([
      { id: "m1", name: "Dell" },
      { id: "m2", name: "HPE" },
    ] as never);

    const clusters = await getModelClusters();
    expect(clusters).toEqual([
      [
        { model: "PowerEdge R740", count: 5, types: ["Server"], manufacturers: ["Dell"] },
        { model: "poweredge r740", count: 2, types: ["Server"], manufacturers: ["Dell"] },
      ],
    ]);
  });

  it("returns no clusters when nothing is similar", async () => {
    mockQueryRaw.mockResolvedValue([
      { model: "PowerEdge R740", typeId: null, manufacturerId: null, count: BigInt(5) },
      { model: "HPE ProLiant DL380", typeId: null, manufacturerId: null, count: BigInt(3) },
    ] as never);
    mockTypes.mockResolvedValue([] as never);
    mockManufacturers.mockResolvedValue([] as never);

    const clusters = await getModelClusters();
    expect(clusters).toEqual([]);
  });
});
