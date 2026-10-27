import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { supplier: { findMany: vi.fn() } } }));

import { prisma } from "@/lib/prisma";
import { findConflictingWindows, supplierSchema } from "@/lib/schemas/supplier";

const findMany = vi.mocked(prisma.supplier.findMany);
const supplier = (name: string, defaultFrom: string, defaultUntil: string | null) =>
  ({ id: name, name, defaultFrom: new Date(defaultFrom), defaultUntil: defaultUntil ? new Date(defaultUntil) : null });

beforeEach(() => vi.clearAllMocks());

describe("findConflictingWindows()", () => {
  it("returns null without querying when the candidate window is inactive", async () => {
    expect(await findConflictingWindows({ defaultFrom: null, defaultUntil: null })).toBeNull();
    expect(findMany).not.toHaveBeenCalled();
  });

  it("returns every supplier that overlaps the candidate", async () => {
    findMany.mockResolvedValue([
      supplier("A", "2026-01-01", "2026-03-31"),
      supplier("B", "2026-03-01", null),
      supplier("C", "2027-01-01", "2027-12-31"),
    ] as never);
    expect(await findConflictingWindows({ defaultFrom: "2026-03-15", defaultUntil: "2026-06-30" })).toEqual(["A", "B"]);
  });

  it("ignores overlaps among existing suppliers that the candidate does not touch", async () => {
    findMany.mockResolvedValue([supplier("A", "2026-01-01", null), supplier("B", "2026-02-01", null)] as never);
    // Candidate ends before either window starts.
    expect(await findConflictingWindows({ defaultFrom: "2025-01-01", defaultUntil: "2025-12-31" })).toBeNull();
  });

  it("excludes the supplier being updated", async () => {
    findMany.mockResolvedValue([] as never);
    await findConflictingWindows({ defaultFrom: "2026-01-01", defaultUntil: null }, "self");
    expect(findMany.mock.calls[0][0]!.where).toMatchObject({ NOT: { id: "self" } });
  });
});

describe("supplierSchema", () => {
  it("requires defaultFrom when defaultUntil is set, and a non-inverted window", () => {
    expect(supplierSchema.safeParse({ name: "X", defaultUntil: "2026-01-01" }).success).toBe(false);
    expect(supplierSchema.safeParse({ name: "X", defaultFrom: "2026-02-01", defaultUntil: "2026-01-01" }).success).toBe(false);
    expect(supplierSchema.safeParse({ name: "X", defaultFrom: "2026-01-01", defaultUntil: "2026-02-01" }).success).toBe(true);
  });
});
