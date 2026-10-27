import { describe, it, expect } from "vitest";
import { supplierSchema } from "@/lib/schemas/supplier";

describe("supplierSchema", () => {
  it("requires defaultFrom when defaultUntil is set, and a non-inverted window", () => {
    expect(supplierSchema.safeParse({ name: "X", defaultUntil: "2026-01-01" }).success).toBe(false);
    expect(supplierSchema.safeParse({ name: "X", defaultFrom: "2026-02-01", defaultUntil: "2026-01-01" }).success).toBe(false);
    expect(supplierSchema.safeParse({ name: "X", defaultFrom: "2026-01-01", defaultUntil: "2026-02-01" }).success).toBe(true);
  });
});
