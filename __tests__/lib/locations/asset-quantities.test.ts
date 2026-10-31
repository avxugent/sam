import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { asset: { aggregate: vi.fn(), groupBy: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import { withInstalledQuantities } from "@/lib/locations/asset-quantities";

const location = {
  id: "room",
  name: "Room",
  _count: { assets: 3, children: 2, attachments: 1 },
  children: [
    { id: "c1", name: "Rack 1", _count: { assets: 5, children: 0 } },
    { id: "c2", name: "Rack 2", _count: { assets: 1, children: 0 } },
  ],
};

beforeEach(() => {
  vi.mocked(prisma.asset.aggregate).mockResolvedValue({ _sum: { quantity: 42 } } as never);
  vi.mocked(prisma.asset.groupBy).mockResolvedValue([
    { locationId: "room", _sum: { quantity: 20 } },
    { locationId: "c1", _sum: { quantity: 2 } },
  ] as never);
});

describe("withInstalledQuantities()", () => {
  it("replaces row counts with installed units, directly per location and over the subtree", async () => {
    const result = await withInstalledQuantities(location, ["room", "c1", "c2", "c1-shelf"]);
    expect(result.subtreeAssetCount).toBe(42);
    expect(result.location._count).toEqual({ assets: 20, children: 2, attachments: 1 });
    expect(result.location.children.map((c) => [c.id, c._count.assets, c._count.children])).toEqual([
      ["c1", 2, 0],
      ["c2", 0, 0], // no installed units placed directly in it
    ]);
    expect(result.location.name).toBe("Room");
  });

  it("counts INSTALLED assets only, the subtree for the total and location + children for the direct sums", async () => {
    await withInstalledQuantities(location, ["room", "c1", "c2", "c1-shelf"]);
    expect(prisma.asset.aggregate).toHaveBeenCalledWith({
      where: { locationId: { in: ["room", "c1", "c2", "c1-shelf"] }, status: "INSTALLED" },
      _sum: { quantity: true },
    });
    expect(prisma.asset.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      by: ["locationId"],
      where: { locationId: { in: ["room", "c1", "c2"] }, status: "INSTALLED" },
    }));
  });

  it("treats an empty subtree as zero units", async () => {
    vi.mocked(prisma.asset.aggregate).mockResolvedValue({ _sum: { quantity: null } } as never);
    vi.mocked(prisma.asset.groupBy).mockResolvedValue([] as never);
    const result = await withInstalledQuantities({ ...location, children: [] }, ["room"]);
    expect(result.subtreeAssetCount).toBe(0);
    expect(result.location._count.assets).toBe(0);
  });
});
