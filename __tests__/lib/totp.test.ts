import { describe, it, expect } from "vitest";
import speakeasy from "speakeasy";
import { generateTotpSecret, verifyTotpCode } from "@/lib/totp";

// ── generateTotpSecret ───────────────────────────────────────────────────────

describe("generateTotpSecret()", () => {
  it("returns a non-empty base32 secret", () => {
    const { base32 } = generateTotpSecret("test@example.com");
    expect(base32).toBeTruthy();
    expect(typeof base32).toBe("string");
    expect(base32.length).toBeGreaterThan(10);
  });

  it("returns a valid otpauth:// URI", () => {
    const { otpauthUrl } = generateTotpSecret("user@example.com");
    expect(otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
  });

  it("includes the user email in the otpauth URI", () => {
    const { otpauthUrl } = generateTotpSecret("alice@ugent.be");
    expect(decodeURIComponent(otpauthUrl)).toContain("alice@ugent.be");
  });

  it("generates unique secrets for different calls", () => {
    const a = generateTotpSecret("a@test.com");
    const b = generateTotpSecret("b@test.com");
    expect(a.base32).not.toBe(b.base32);
  });
});

// ── verifyTotpCode ────────────────────────────────────────────────────────────

describe("verifyTotpCode()", () => {
  it("returns true for the current valid token", () => {
    const { base32 } = generateTotpSecret("test@example.com");
    // Generate the current valid token using speakeasy directly
    const token = speakeasy.totp({ secret: base32, encoding: "base32" });
    expect(verifyTotpCode(base32, token)).toBe(true);
  });

  it("returns false for an incorrect code", () => {
    const { base32 } = generateTotpSecret("test@example.com");
    expect(verifyTotpCode(base32, "000000")).toBe(false);
  });

  it("returns false for an empty code", () => {
    const { base32 } = generateTotpSecret("test@example.com");
    expect(verifyTotpCode(base32, "")).toBe(false);
  });

  it("strips spaces before verification (handles formatted input like '123 456')", () => {
    const { base32 } = generateTotpSecret("test@example.com");
    const token = speakeasy.totp({ secret: base32, encoding: "base32" });
    // Insert a space in the middle as some authenticator apps display
    const withSpace = token.slice(0, 3) + " " + token.slice(3);
    expect(verifyTotpCode(base32, withSpace)).toBe(true);
  });

  it("accepts tokens from within the clock-skew window (step ±1)", () => {
    const { base32 } = generateTotpSecret("test@example.com");
    // Generate a token 30 seconds ago (one step behind)
    const prevToken = speakeasy.totp({
      secret: base32,
      encoding: "base32",
      time: Math.floor(Date.now() / 1000) - 30,
    });
    // Should still be accepted due to window=1
    expect(verifyTotpCode(base32, prevToken)).toBe(true);
  });
});
