import { describe, it, expect } from "vitest";
import { isWindowActive, findCurrentDefaultSupplier, findWindowOverlap } from "@/lib/supplier-window";

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

describe("findWindowOverlap()", () => {
  it("returns null for disjoint windows", () => {
    expect(
      findWindowOverlap([
        { id: "a", defaultFrom: "2026-01-01", defaultUntil: "2026-06-30" },
        { id: "b", defaultFrom: "2026-07-01", defaultUntil: "2026-12-31" },
      ])
    ).toBeNull();
  });

  it("detects overlapping bounded windows (shared boundary day counts)", () => {
    expect(
      findWindowOverlap([
        { id: "a", defaultFrom: "2026-01-01", defaultUntil: "2026-07-01" },
        { id: "b", defaultFrom: "2026-07-01", defaultUntil: "2026-12-31" },
      ])
    ).toEqual(["a", "b"]);
  });

  it("detects overlap with an open-ended window", () => {
    expect(
      findWindowOverlap([
        { id: "a", defaultFrom: "2026-01-01", defaultUntil: null },
        { id: "b", defaultFrom: "2027-05-01", defaultUntil: "2027-06-01" },
      ])
    ).toEqual(["a", "b"]);
  });

  it("ignores windows without defaultFrom", () => {
    expect(
      findWindowOverlap([
        { id: "a", defaultFrom: null, defaultUntil: null },
        { id: "b", defaultFrom: "2026-01-01", defaultUntil: null },
      ])
    ).toBeNull();
  });
});
