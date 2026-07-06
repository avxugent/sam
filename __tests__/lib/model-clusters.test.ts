import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    asset: { groupBy: vi.fn() },
    assetType: { findMany: vi.fn() },
    manufacturer: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { getModelItems, getModelClusters } from "@/lib/model-clusters";

const mockGroupBy = vi.mocked(prisma.asset.groupBy);
const mockTypes = vi.mocked(prisma.assetType.findMany);
const mockManufacturers = vi.mocked(prisma.manufacturer.findMany);

beforeEach(() => vi.clearAllMocks());

describe("getModelItems()", () => {
  it("attaches distinct type/manufacturer names to each raw model spelling", async () => {
    mockGroupBy.mockResolvedValue([
      { model: "PowerEdge R740", typeId: "t1", manufacturerId: "m1", _count: { id: 5 } },
      { model: "HPE ProLiant DL380", typeId: "t1", manufacturerId: "m2", _count: { id: 3 } },
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
    mockGroupBy.mockResolvedValue([
      { model: "PowerEdge R740", typeId: "t1", manufacturerId: "m1", _count: { id: 5 } },
      { model: "PowerEdge R740", typeId: "t2", manufacturerId: "m1", _count: { id: 1 } },
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
    mockGroupBy.mockResolvedValue([
      { model: "PowerEdge R740", typeId: null, manufacturerId: null, _count: { id: 5 } },
    ] as never);
    mockTypes.mockResolvedValue([] as never);
    mockManufacturers.mockResolvedValue([] as never);

    const items = await getModelItems();
    expect(items).toEqual([{ model: "PowerEdge R740", count: 5, types: [], manufacturers: [] }]);
  });
});

describe("getModelClusters()", () => {
  it("groups similar spellings computed from getModelItems()", async () => {
    mockGroupBy.mockResolvedValue([
      { model: "PowerEdge R740", typeId: "t1", manufacturerId: "m1", _count: { id: 5 } },
      { model: "poweredge r740", typeId: "t1", manufacturerId: "m1", _count: { id: 2 } },
      { model: "HPE ProLiant DL380", typeId: "t1", manufacturerId: "m2", _count: { id: 3 } },
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
    mockGroupBy.mockResolvedValue([
      { model: "PowerEdge R740", typeId: null, manufacturerId: null, _count: { id: 5 } },
      { model: "HPE ProLiant DL380", typeId: null, manufacturerId: null, _count: { id: 3 } },
    ] as never);
    mockTypes.mockResolvedValue([] as never);
    mockManufacturers.mockResolvedValue([] as never);

    const clusters = await getModelClusters();
    expect(clusters).toEqual([]);
  });
});
