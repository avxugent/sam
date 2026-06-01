import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  __esModule: true,
  prisma: {
    location: { findMany: vi.fn() },
    asset: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { generateExportCsv } from "@/lib/csv-export";

const mockLocFind = vi.mocked(prisma.location.findMany);
const mockAssetFind = vi.mocked(prisma.asset.findMany);

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
});
