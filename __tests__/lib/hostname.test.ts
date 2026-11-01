import { describe, it, expect } from "vitest";
import { validateHostnamePattern, isHostnameCompliant } from "@/lib/hostname";

describe("validateHostnamePattern()", () => {
  it("returns null for a valid pattern", () => {
    expect(validateHostnamePattern("^rec-\\d{3}\\.ugent\\.be$")).toBeNull();
  });

  it("returns an error message for an invalid pattern", () => {
    expect(validateHostnamePattern("(unclosed")).not.toBeNull();
  });
});

describe("isHostnameCompliant()", () => {
  it("uses the type's pattern when it is valid", () => {
    expect(isHostnameCompliant("rec-01", "^rec-\\d+$")).toBe(true);
    expect(isHostnameCompliant("rec-01.example.org", "^rec-\\d+$")).toBe(false);
  });

  it("matches the pattern case-insensitively", () => {
    expect(isHostnameCompliant("REC-001.UGENT.BE", "^rec-\\d{3}\\.ugent\\.be$")).toBe(true);
  });

  it("falls back to the generic FQDN check for no pattern or an invalid one", () => {
    for (const pattern of [null, "", "(unclosed"]) {
      expect(isHostnameCompliant("rec-01.example.org", pattern)).toBe(true);
      expect(isHostnameCompliant("not a hostname", pattern)).toBe(false);
    }
  });
});
