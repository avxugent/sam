import { describe, it, expect } from "vitest";
import { effectiveCriticality, CRITICALITY_VALUES, parseCriticality } from "@/lib/criticality";

describe("effectiveCriticality()", () => {
  it("per-asset override wins over the type default", () => {
    expect(effectiveCriticality("HIGH", "LOW")).toBe("HIGH");
  });

  it("falls back to the type default when the asset has none", () => {
    expect(effectiveCriticality(null, "MEDIUM")).toBe("MEDIUM");
    expect(effectiveCriticality(undefined, "CRITICAL")).toBe("CRITICAL");
  });

  it("returns null (unclassified) when neither is set", () => {
    expect(effectiveCriticality(null, null)).toBeNull();
    expect(effectiveCriticality(undefined, undefined)).toBeNull();
  });
});

describe("CRITICALITY_VALUES", () => {
  it("contains the four levels in ascending order", () => {
    expect(CRITICALITY_VALUES).toEqual(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
  });
});

describe("parseCriticality()", () => {
  it("returns the level for an enum member", () => {
    expect(parseCriticality("HIGH")).toBe("HIGH");
  });

  it("returns null for anything else (case-sensitive)", () => {
    expect(parseCriticality("high")).toBeNull();
    expect(parseCriticality("URGENT")).toBeNull();
    expect(parseCriticality("")).toBeNull();
  });
});
