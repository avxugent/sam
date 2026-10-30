import { describe, it, expect } from "vitest";
import { validateHostnamePattern, matchesHostnamePattern, isHostnameCompliant } from "@/lib/hostname";

describe("validateHostnamePattern()", () => {
  it("returns null for a valid pattern", () => {
    expect(validateHostnamePattern("^rec-\\d{3}\\.ugent\\.be$")).toBeNull();
  });

  it("returns an error message for an invalid pattern", () => {
    expect(validateHostnamePattern("(unclosed")).not.toBeNull();
  });
});

describe("matchesHostnamePattern()", () => {
  it("matches a hostname against a pattern", () => {
    expect(matchesHostnamePattern("rec-001.ugent.be", "^rec-\\d{3}\\.ugent\\.be$")).toBe(true);
  });

  it("rejects a hostname that doesn't match the pattern", () => {
    expect(matchesHostnamePattern("other.ugent.be", "^rec-\\d{3}\\.ugent\\.be$")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(matchesHostnamePattern("REC-001.UGENT.BE", "^rec-\\d{3}\\.ugent\\.be$")).toBe(true);
  });

  it("returns true (no rule) when pattern is null", () => {
    expect(matchesHostnamePattern("anything", null)).toBe(true);
  });

  it("returns true (no rule) when pattern is empty", () => {
    expect(matchesHostnamePattern("anything", "")).toBe(true);
  });

  it("returns true (fail open) when pattern is an invalid regex", () => {
    expect(matchesHostnamePattern("anything", "(unclosed")).toBe(true);
  });
});

describe("isHostnameCompliant()", () => {
  it("uses the type's pattern when it is valid", () => {
    expect(isHostnameCompliant("rec-01", "^rec-\\d+$")).toBe(true);
    expect(isHostnameCompliant("rec-01.example.org", "^rec-\\d+$")).toBe(false);
  });

  it("falls back to the generic FQDN check for no pattern or an invalid one", () => {
    for (const pattern of [null, "", "(unclosed"]) {
      expect(isHostnameCompliant("rec-01.example.org", pattern)).toBe(true);
      expect(isHostnameCompliant("not a hostname", pattern)).toBe(false);
    }
  });
});
