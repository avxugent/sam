import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  prisma: {
    location: { findMany: vi.fn() },
    asset: { findMany: vi.fn() },
    stockItem: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { generateExportCsv, generateDecommissionedCsv, generateStockCsv } from "@/lib/csv-export";

const mockLocFind = vi.mocked(prisma.location.findMany);
const mockAssetFind = vi.mocked(prisma.asset.findMany);
const mockStockFind = vi.mocked(prisma.stockItem.findMany);
const mockQueryRaw = vi.mocked(prisma.$queryRaw);

// campus → building → room hierarchy
const LOCATIONS = [
  { id: "campus", name: "Campus A", fiNumber: null, parentId: null },
  { id: "bldg", name: "Building B", fiNumber: null, parentId: "campus" },
  { id: "room", name: "Room 101", fiNumber: "14.10.100.013", parentId: "bldg" },
];

function asset(overrides: Record<string, unknown> = {}) {
  return {
    id: "a1",
    model: "OptiPlex 7090",
    serialNumber: "SN123",
    hostname: "pc-01",
    installationDate: new Date("2024-01-15T00:00:00Z"),
    invoiceDate: new Date("2024-02-20T00:00:00Z"),
    invoiceNumber: "INV-9",
    status: "INSTALLED",
    type: { name: "Desktop" },
    manufacturer: { name: "Dell" },
    macAddresses: [{ address: "aa:bb:cc:dd:ee:ff" }],
    customFields: [{ key: "guid", value: "G-1" }],
    location: LOCATIONS[2],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLocFind.mockResolvedValue(LOCATIONS as never);
  mockAssetFind.mockResolvedValue([asset()] as never);
});

describe("generateExportCsv()", () => {
  it("emits a header row first", async () => {
    const csv = await generateExportCsv();
    const header = csv.split("\r\n")[0];
    expect(header.startsWith("CAMPUS;GEBOUW;LOKAAL;FI NUMMER;")).toBe(true);
    expect(header).toContain("GUID");
    expect(header).toContain("CONTACTPERSOON");
  });

  it("maps an asset row with full hierarchy, mac, dates, and custom fields", async () => {
    const csv = await generateExportCsv();
    const row = csv.split("\r\n")[1].split(";");
    expect(row[0]).toBe("Campus A");
    expect(row[1]).toBe("Building B");
    expect(row[2]).toBe("Room 101");
    expect(row[3]).toBe("14.10.100.013");
    expect(row[4]).toBe("Desktop");
    expect(row[5]).toBe("Dell");
    expect(row[6]).toBe("OptiPlex 7090");
    expect(row[7]).toBe("SN123");
    expect(row[8]).toBe("aa:bb:cc:dd:ee:ff");
    expect(row[9]).toBe("pc-01");
    expect(row[10]).toBe("2024-01-15");
    expect(row[11]).toBe("2024-02-20");
    expect(row[12]).toBe("INV-9");
    // GUID is the first custom field column
    expect(row[13]).toBe("G-1");
  });

  it("excludes decommissioned by default; includes them when asked", async () => {
    await generateExportCsv();
    expect(mockAssetFind).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "INSTALLED" } })
    );
    mockAssetFind.mockClear();
    await generateExportCsv(true);
    expect(mockAssetFind).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it("escapes cells containing the delimiter, quotes, or newlines", async () => {
    mockAssetFind.mockResolvedValue([
      asset({ model: 'has;semi', serialNumber: 'a"b', hostname: "line\nbreak" }),
    ] as never);
    const csv = await generateExportCsv();
    const row = csv.split("\r\n")[1];
    expect(row).toContain('"has;semi"');
    expect(row).toContain('"a""b"'); // doubled quote
    expect(row).toContain('"line\nbreak"');
  });

  it("falls back to location name when room level is missing", async () => {
    const flat = [{ id: "solo", name: "Standalone", fiNumber: null, parentId: null }];
    mockLocFind.mockResolvedValue(flat as never);
    mockAssetFind.mockResolvedValue([asset({ location: flat[0] })] as never);
    const csv = await generateExportCsv();
    const row = csv.split("\r\n")[1].split(";");
    // campus=Standalone, building="", room falls back to loc.name
    expect(row[0]).toBe("Standalone");
    expect(row[2]).toBe("Standalone");
  });

  it("appends asset-less leaf locations, skipping non-leaf ones", async () => {
    mockAssetFind.mockResolvedValue([] as never); // no assets at all
    const csv = await generateExportCsv();
    const lines = csv.split("\r\n");
    // header + one row for the leaf "room"; campus & bldg are non-leaf → skipped
    expect(lines).toHaveLength(2);
    const row = lines[1].split(";");
    expect(row[2]).toBe("Room 101");
    expect(row[4]).toBe(""); // empty asset fields
  });

  it("formats empty string for missing dates", async () => {
    mockAssetFind.mockResolvedValue([
      asset({ installationDate: null, invoiceDate: null }),
    ] as never);
    const csv = await generateExportCsv();
    const row = csv.split("\r\n")[1].split(";");
    expect(row[10]).toBe("");
    expect(row[11]).toBe("");
  });

  it("filters on status only — never excludes maintenance-room assets", async () => {
    await generateExportCsv();
    const call = mockAssetFind.mock.calls[0][0] as { where: Record<string, unknown> };
    // Exactly the status filter: no location / inMaintenance constraint that
    // could drop assets sitting in a room that is in maintenance.
    expect(call.where).toEqual({ status: "INSTALLED" });
  });
});

describe("generateDecommissionedCsv()", () => {
  function decommissioned(overrides: Record<string, unknown> = {}) {
    return asset({
      status: "DECOMMISSIONED",
      decommissionedAt: new Date("2025-03-10T00:00:00Z"),
      decommissionNote: "end of life",
      lastLocationName: "Room 101",
      lastLocationFiNumber: "14.10.100.013",
      ...overrides,
    });
  }

  it("queries only DECOMMISSIONED assets and appends the decommission columns", async () => {
    mockAssetFind.mockResolvedValue([decommissioned()] as never);
    const csv = await generateDecommissionedCsv();

    expect(mockAssetFind).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "DECOMMISSIONED" } })
    );

    const lines = csv.split("\r\n");
    const header = lines[0];
    expect(header.endsWith("DECOMMISSIONED_AT;DECOMMISSION_NOTE;LAST_LOCATION;LAST_FI_NUMBER")).toBe(true);

    const row = lines[1].split(";");
    expect(row.slice(-4)).toEqual([
      "2025-03-10",
      "end of life",
      "Room 101",
      "14.10.100.013",
    ]);
  });

  it("renders empty cells for an asset with all-null fields", async () => {
    mockAssetFind.mockResolvedValue([
      decommissioned({
        type: null,
        manufacturer: null,
        model: null,
        serialNumber: null,
        hostname: null,
        installationDate: null,
        invoiceDate: null,
        invoiceNumber: null,
        macAddresses: [],
        customFields: [],
        decommissionedAt: null,
        decommissionNote: null,
        lastLocationName: null,
        lastLocationFiNumber: null,
      }),
    ] as never);
    const csv = await generateDecommissionedCsv();
    const row = csv.split("\r\n")[1].split(";");
    // Location columns still resolve; the trailing decommission cells are empty.
    expect(row[2]).toBe("Room 101");
    expect(row.slice(-4)).toEqual(["", "", "", ""]);
  });
});

describe("generateStockCsv()", () => {
  function stockItem(overrides: Record<string, unknown> = {}) {
    return {
      id: "s1",
      model: "Latitude 5540",
      serialNumber: "SN-STK",
      quantity: 3,
      reservedForLocationId: "room",
      metadata: JSON.stringify({ macAddresses: [{ address: "11:22:33:44:55:66" }] }),
      notes: "spare",
      invoiceDate: new Date("2024-05-01T00:00:00Z"),
      invoiceNumber: "INV-STK",
      type: { name: "Laptop" },
      manufacturer: { name: "Dell" },
      ...overrides,
    };
  }

  beforeEach(() => {
    mockQueryRaw.mockResolvedValue(
      LOCATIONS.map((l) => ({ id: l.id, name: l.name, parentId: l.parentId })) as never
    );
    mockLocFind.mockResolvedValue([{ id: "room", fiNumber: "14.10.100.013" }] as never);
  });

  it("emits the stock header and maps a row with reserved location and mac", async () => {
    mockStockFind.mockResolvedValue([stockItem()] as never);
    const csv = await generateStockCsv();
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("TYPE;BRAND;MODEL;SERIAL;QUANTITY;RESERVED_FOR;RESERVED_FI;MAC;NOTES;INVOICE_DATE;INVOICE_NUMBER");

    const row = lines[1].split(";");
    expect(row[0]).toBe("Laptop");
    expect(row[1]).toBe("Dell");
    expect(row[2]).toBe("Latitude 5540");
    expect(row[3]).toBe("SN-STK");
    expect(row[4]).toBe("3");
    expect(row[5]).toBe("Campus A - Building B - Room 101");
    expect(row[6]).toBe("14.10.100.013");
    expect(row[7]).toBe("11:22:33:44:55:66");
    expect(row[8]).toBe("spare");
    expect(row[9]).toBe("2024-05-01");
    expect(row[10]).toBe("INV-STK");
  });

  it("leaves reserved/mac columns empty for unreserved items with no metadata", async () => {
    mockStockFind.mockResolvedValue([
      stockItem({
        reservedForLocationId: null,
        metadata: null,
        type: null,
        manufacturer: null,
        serialNumber: null,
        notes: null,
        invoiceDate: null,
        invoiceNumber: null,
      }),
    ] as never);
    const csv = await generateStockCsv();
    const row = csv.split("\r\n")[1].split(";");
    expect(row[0]).toBe(""); // TYPE
    expect(row[1]).toBe(""); // BRAND
    expect(row[5]).toBe(""); // RESERVED_FOR
    expect(row[6]).toBe(""); // RESERVED_FI
    expect(row[7]).toBe(""); // MAC
    expect(row[8]).toBe(""); // NOTES
    expect(row[9]).toBe(""); // INVOICE_DATE
  });

  it("treats malformed metadata as no mac addresses", async () => {
    mockStockFind.mockResolvedValue([
      stockItem({ reservedForLocationId: null, metadata: "{not valid json" }),
    ] as never);
    const csv = await generateStockCsv();
    const row = csv.split("\r\n")[1].split(";");
    expect(row[7]).toBe(""); // MAC — parse failure falls back to empty
  });
});
