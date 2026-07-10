import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  prisma: {
    asset: { findMany: vi.fn() },
    supplier: { findMany: vi.fn() },
    location: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { buildInventorySnapshot } from "@/lib/inventory-snapshot";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.asset.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.supplier.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.location.findMany).mockResolvedValue([] as never);
});

describe("buildInventorySnapshot()", () => {
  it("returns counts and generatedAt for an empty inventory", async () => {
    const snap = await buildInventorySnapshot();
    expect(snap.counts).toEqual({ assets: 0, locations: 0, suppliers: 0 });
    expect(new Date(snap.generatedAt).getTime()).not.toBeNaN();
    expect(snap.assets).toEqual([]);
  });

  it("maps assets with effective criticality and date-only fields", async () => {
    vi.mocked(prisma.asset.findMany).mockResolvedValue([
      {
        id: "a1",
        status: "INSTALLED",
        model: "U2723",
        serialNumber: "SN1",
        hostname: "pc.x.y",
        locationId: "loc-1",
        installationDate: new Date("2024-01-15T00:00:00Z"),
        invoiceNumber: null,
        invoiceDate: null,
        ownerId: "u1",
        criticality: null,
        endOfSupportDate: new Date("2030-06-30T00:00:00Z"),
        supplierId: "s1",
        disposalMethod: null,
        decommissionedAt: null,
        type: { name: "Display", defaultCriticality: "HIGH" },
        manufacturer: { name: "Dell" },
        macAddresses: [{ address: "AA:BB:CC:DD:EE:FF" }],
      },
    ] as never);
    vi.mocked(prisma.supplier.findMany).mockResolvedValue([
      {
        id: "s1",
        name: "CampusStore",
        contractReference: "FW-1",
        contactInfo: null,
        defaultFrom: new Date("2026-01-01T00:00:00Z"),
        defaultUntil: null,
        createdAt: new Date(),
      },
    ] as never);
    vi.mocked(prisma.location.findMany).mockResolvedValue([
      { id: "loc-1", name: "Room 1", parentId: null, fiNumber: null },
    ] as never);

    const snap = await buildInventorySnapshot();
    expect(snap.counts).toEqual({ assets: 1, locations: 1, suppliers: 1 });

    const asset = snap.assets[0];
    expect(asset.typeName).toBe("Display");
    expect(asset.effectiveCriticality).toBe("HIGH"); // inherited
    expect(asset.criticality).toBeNull();
    expect(asset.installationDate).toBe("2024-01-15");
    expect(asset.endOfSupportDate).toBe("2030-06-30");
    expect(asset.macAddresses).toEqual(["AA:BB:CC:DD:EE:FF"]);

    expect(snap.suppliers[0]).toEqual({
      id: "s1",
      name: "CampusStore",
      contractReference: "FW-1",
      defaultFrom: "2026-01-01",
      defaultUntil: null,
    });
  });
});
