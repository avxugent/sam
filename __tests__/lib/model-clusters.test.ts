import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    model: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { getModelItems, getModelClusters } from "@/lib/model-clusters";

const mockFindMany = vi.mocked(prisma.model.findMany);

beforeEach(() => vi.clearAllMocks());

describe("getModelItems()", () => {
  it("attaches type/manufacturer names and the combined usage count to each Model row", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "mo1",
        name: "PowerEdge R740",
        type: { name: "Server" },
        manufacturer: { name: "Dell" },
        _count: { assets: 5, stockItems: 0 },
      },
      {
        id: "mo2",
        name: "HPE ProLiant DL380",
        type: { name: "Server" },
        manufacturer: { name: "HPE" },
        _count: { assets: 2, stockItems: 1 },
      },
    ] as never);

    const items = await getModelItems();
    expect(items).toEqual([
      { id: "mo1", model: "PowerEdge R740", count: 5, typeName: "Server", manufacturerName: "Dell" },
      { id: "mo2", model: "HPE ProLiant DL380", count: 3, typeName: "Server", manufacturerName: "HPE" },
    ]);
  });

  it("returns a null manufacturerName when the model has no manufacturer", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "mo1",
        name: "PowerEdge R740",
        type: { name: "Server" },
        manufacturer: null,
        _count: { assets: 5, stockItems: 0 },
      },
    ] as never);

    const items = await getModelItems();
    expect(items).toEqual([{ id: "mo1", model: "PowerEdge R740", count: 5, typeName: "Server", manufacturerName: null }]);
  });
});

describe("getModelClusters()", () => {
  it("groups similar spellings computed from getModelItems()", async () => {
    mockFindMany.mockResolvedValue([
      { id: "mo1", name: "PowerEdge R740", type: { name: "Server" }, manufacturer: { name: "Dell" }, _count: { assets: 5, stockItems: 0 } },
      { id: "mo2", name: "poweredge r740", type: { name: "Server" }, manufacturer: { name: "Dell" }, _count: { assets: 2, stockItems: 0 } },
      { id: "mo3", name: "HPE ProLiant DL380", type: { name: "Server" }, manufacturer: { name: "HPE" }, _count: { assets: 3, stockItems: 0 } },
    ] as never);

    const clusters = await getModelClusters();
    expect(clusters).toEqual([
      [
        { id: "mo1", model: "PowerEdge R740", count: 5, typeName: "Server", manufacturerName: "Dell" },
        { id: "mo2", model: "poweredge r740", count: 2, typeName: "Server", manufacturerName: "Dell" },
      ],
    ]);
  });

  it("returns no clusters when nothing is similar", async () => {
    mockFindMany.mockResolvedValue([
      { id: "mo1", name: "PowerEdge R740", type: { name: "Server" }, manufacturer: null, _count: { assets: 5, stockItems: 0 } },
      { id: "mo2", name: "HPE ProLiant DL380", type: { name: "Server" }, manufacturer: null, _count: { assets: 3, stockItems: 0 } },
    ] as never);

    const clusters = await getModelClusters();
    expect(clusters).toEqual([]);
  });
});
