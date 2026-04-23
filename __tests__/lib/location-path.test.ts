import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

import {
  parseFiNumber,
  buildLocationPathString,
  findFiNumber,
  getAllDescendantLocationIds,
  type LocationAncestor,
} from "@/lib/location-path";
import { prisma } from "@/lib/prisma";

const mockQueryRaw = vi.mocked(prisma.$queryRaw);

// ── parseFiNumber ───────────────────────────────────────────────────────────

describe("parseFiNumber()", () => {
  it("parses a valid FI number", () => {
    const result = parseFiNumber("14.10.100.013");
    expect(result).toEqual({
      campus: "14",
      building: "10",
      floor: "100",
      room: "013",
    });
  });

  it("parses leading-zero numbers correctly", () => {
    const result = parseFiNumber("01.02.003.004");
    expect(result).toEqual({
      campus: "01",
      building: "02",
      floor: "003",
      room: "004",
    });
  });

  it("returns null for null input", () => {
    expect(parseFiNumber(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(parseFiNumber(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseFiNumber("")).toBeNull();
  });

  it("returns null for wrong segment count", () => {
    expect(parseFiNumber("14.10.100")).toBeNull();
    expect(parseFiNumber("14.10.100.013.999")).toBeNull();
  });

  it("returns null for wrong digit counts", () => {
    expect(parseFiNumber("1.10.100.013")).toBeNull();   // CC must be 2 digits
    expect(parseFiNumber("14.1.100.013")).toBeNull();   // BB must be 2 digits
    expect(parseFiNumber("14.10.10.013")).toBeNull();   // FFF must be 3 digits
    expect(parseFiNumber("14.10.100.13")).toBeNull();   // RRR must be 3 digits
  });

  it("returns null for non-numeric segments", () => {
    expect(parseFiNumber("AB.10.100.013")).toBeNull();
  });
});

// ── buildLocationPathString ─────────────────────────────────────────────────

describe("buildLocationPathString()", () => {
  const ancestors: LocationAncestor[] = [
    { id: "1", name: "Campus A",   fiNumber: null },
    { id: "2", name: "Building 10", fiNumber: null },
    { id: "3", name: "Floor 1",    fiNumber: null },
    { id: "4", name: "Room 013",   fiNumber: "14.10.100.013" },
  ];

  it("joins ancestor names with ' / '", () => {
    expect(buildLocationPathString(ancestors)).toBe(
      "Campus A / Building 10 / Floor 1 / Room 013"
    );
  });

  it("returns the single name for a single ancestor", () => {
    expect(buildLocationPathString([{ id: "x", name: "Only", fiNumber: null }])).toBe("Only");
  });

  it("returns empty string for no ancestors", () => {
    expect(buildLocationPathString([])).toBe("");
  });
});

// ── findFiNumber ─────────────────────────────────────────────────────────────

describe("findFiNumber()", () => {
  it("returns the leaf-level fiNumber", () => {
    const ancestors: LocationAncestor[] = [
      { id: "1", name: "Campus",   fiNumber: null },
      { id: "2", name: "Building", fiNumber: null },
      { id: "3", name: "Room",     fiNumber: "14.10.100.013" },
    ];
    expect(findFiNumber(ancestors)).toBe("14.10.100.013");
  });

  it("returns the deepest fiNumber when multiple levels have one", () => {
    const ancestors: LocationAncestor[] = [
      { id: "1", name: "Campus",   fiNumber: "14.00.000.000" },
      { id: "2", name: "Room",     fiNumber: "14.10.100.013" },
    ];
    expect(findFiNumber(ancestors)).toBe("14.10.100.013");
  });

  it("returns null when no ancestor has a fiNumber", () => {
    const ancestors: LocationAncestor[] = [
      { id: "1", name: "Campus", fiNumber: null },
      { id: "2", name: "Room",   fiNumber: null },
    ];
    expect(findFiNumber(ancestors)).toBeNull();
  });

  it("returns null for empty ancestor array", () => {
    expect(findFiNumber([])).toBeNull();
  });
});

// ── getAllDescendantLocationIds ────────────────────────────────────────────────

describe("getAllDescendantLocationIds()", () => {
  it("returns empty array for non-CUID input", async () => {
    await expect(getAllDescendantLocationIds("not-a-cuid")).resolves.toEqual([]);
    await expect(getAllDescendantLocationIds("")).resolves.toEqual([]);
    await expect(getAllDescendantLocationIds("short")).resolves.toEqual([]);
  });

  it("returns descendant ids from the database", async () => {
    const validId = "a".repeat(25);
    mockQueryRaw.mockResolvedValueOnce([{ id: "b".repeat(25) }, { id: "c".repeat(25) }] as never);
    const result = await getAllDescendantLocationIds(validId);
    expect(result).toEqual(["b".repeat(25), "c".repeat(25)]);
  });

  it("returns empty array when no descendants exist", async () => {
    const validId = "a".repeat(25);
    mockQueryRaw.mockResolvedValueOnce([] as never);
    const result = await getAllDescendantLocationIds(validId);
    expect(result).toEqual([]);
  });
});
