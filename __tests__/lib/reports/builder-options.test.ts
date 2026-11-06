import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    assetType: { findMany: vi.fn() },
    manufacturer: { findMany: vi.fn() },
    location: { findMany: vi.fn() },
    workLogItem: { findMany: vi.fn() },
    supplier: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { loadReportBuilderOptions } from "@/lib/reports/builder-options";

describe("loadReportBuilderOptions()", () => {
  it("returns the lookup lists and full-path location scope options", async () => {
    vi.mocked(prisma.assetType.findMany).mockResolvedValue([{ id: "t1", name: "PC" }] as never);
    vi.mocked(prisma.manufacturer.findMany).mockResolvedValue([{ id: "m1", name: "Dell" }] as never);
    const locations = [
      { id: "c", name: "Campus", parentId: null },
      { id: "r", name: "Room", parentId: "c" },
    ];
    vi.mocked(prisma.location.findMany).mockResolvedValue(locations as never);
    vi.mocked(prisma.workLogItem.findMany).mockResolvedValue([{ id: "i1", name: "Review" }] as never);
    vi.mocked(prisma.supplier.findMany).mockResolvedValue([{ id: "s1", name: "Acme" }] as never);

    expect(await loadReportBuilderOptions()).toEqual({
      assetTypes: [{ id: "t1", name: "PC" }],
      manufacturers: [{ id: "m1", name: "Dell" }],
      locations,
      locationScopeOptions: [
        { id: "c", name: "Campus" },
        { id: "r", name: "Campus › Room" },
      ],
      workLogItems: [{ id: "i1", name: "Review" }],
      suppliers: [{ id: "s1", name: "Acme" }],
    });
  });
});
