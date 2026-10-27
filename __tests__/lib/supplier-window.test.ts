import { describe, it, expect } from "vitest";
import { isWindowActive, findCurrentDefaultSupplier, windowsOverlap } from "@/lib/supplier-window";

const day = (s: string) => new Date(`${s}T12:00:00Z`);

describe("isWindowActive()", () => {
  it("is inactive without defaultFrom", () => {
    expect(isWindowActive({ defaultFrom: null, defaultUntil: null }, day("2026-07-09"))).toBe(false);
    expect(isWindowActive({ defaultFrom: null, defaultUntil: "2026-12-31" }, day("2026-07-09"))).toBe(false);
  });

  it("matches inclusively on both boundaries", () => {
    const w = { defaultFrom: "2026-07-01", defaultUntil: "2026-07-31" };
    expect(isWindowActive(w, day("2026-07-01"))).toBe(true);
    expect(isWindowActive(w, day("2026-07-31"))).toBe(true);
    expect(isWindowActive(w, day("2026-06-30"))).toBe(false);
    expect(isWindowActive(w, day("2026-08-01"))).toBe(false);
  });

  it("treats null defaultUntil as open-ended", () => {
    const w = { defaultFrom: "2026-01-01", defaultUntil: null };
    expect(isWindowActive(w, day("2030-01-01"))).toBe(true);
    expect(isWindowActive(w, day("2025-12-31"))).toBe(false);
  });

  it("accepts Date objects as well as strings", () => {
    const w = { defaultFrom: new Date("2026-07-01"), defaultUntil: new Date("2026-07-31") };
    expect(isWindowActive(w, day("2026-07-15"))).toBe(true);
  });
});

describe("findCurrentDefaultSupplier()", () => {
  it("returns the supplier whose window contains today", () => {
    const suppliers = [
      { id: "a", defaultFrom: "2026-01-01", defaultUntil: "2026-06-30" },
      { id: "b", defaultFrom: "2026-07-01", defaultUntil: null },
    ];
    expect(findCurrentDefaultSupplier(suppliers, day("2026-07-09"))?.id).toBe("b");
    expect(findCurrentDefaultSupplier(suppliers, day("2026-03-01"))?.id).toBe("a");
  });

  it("returns null when no window matches", () => {
    expect(findCurrentDefaultSupplier([{ id: "a", defaultFrom: null, defaultUntil: null }], day("2026-07-09"))).toBeNull();
    expect(findCurrentDefaultSupplier([], day("2026-07-09"))).toBeNull();
  });
});

describe("windowsOverlap()", () => {
  it("is false for disjoint windows", () => {
    expect(
      windowsOverlap(
        { defaultFrom: "2026-01-01", defaultUntil: "2026-06-30" },
        { defaultFrom: "2026-07-01", defaultUntil: "2026-12-31" }
      )
    ).toBe(false);
  });

  it("counts a shared boundary day as overlap", () => {
    expect(
      windowsOverlap(
        { defaultFrom: "2026-01-01", defaultUntil: "2026-07-01" },
        { defaultFrom: "2026-07-01", defaultUntil: "2026-12-31" }
      )
    ).toBe(true);
  });

  it("treats a null defaultUntil as open-ended", () => {
    expect(
      windowsOverlap(
        { defaultFrom: "2026-01-01", defaultUntil: null },
        { defaultFrom: "2027-05-01", defaultUntil: "2027-06-01" }
      )
    ).toBe(true);
  });

  it("never overlaps an inactive window", () => {
    expect(
      windowsOverlap({ defaultFrom: null, defaultUntil: null }, { defaultFrom: "2026-01-01", defaultUntil: null })
    ).toBe(false);
  });
});
