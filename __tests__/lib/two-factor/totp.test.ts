import { describe, it, expect } from "vitest";
import { base32Decode, base32Encode, generateTotpCode, generateTotpSecret, verifyTotpCode, generateQrCodeDataUrl } from "@/lib/two-factor/totp";

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
    const token = generateTotpCode(base32);
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
    const token = generateTotpCode(base32);
    // Insert a space in the middle as some authenticator apps display
    const withSpace = token.slice(0, 3) + " " + token.slice(3);
    expect(verifyTotpCode(base32, withSpace)).toBe(true);
  });

  it("accepts tokens from within the clock-skew window (step ±1)", () => {
    const { base32 } = generateTotpSecret("test@example.com");
    // Generate a token 30 seconds ago (one step behind)
    const now = Date.now();
    const prevToken = generateTotpCode(base32, now - 30_000);
    // Should still be accepted due to window=1
    expect(verifyTotpCode(base32, prevToken, now)).toBe(true);
  });

  it("rejects tokens two steps away", () => {
    const { base32 } = generateTotpSecret("test@example.com");
    const now = Date.now();
    expect(verifyTotpCode(base32, generateTotpCode(base32, now - 60_000), now)).toBe(false);
  });

  it("rejects non-numeric tokens and an invalid secret", () => {
    expect(verifyTotpCode("GEZDGNBVGY3TQOJQ", "12a456")).toBe(false);
    expect(verifyTotpCode("not base32!", "123456")).toBe(false);
  });
});

// ── RFC 6238 test vectors (SHA-1 seed "12345678901234567890", truncated to 6 digits) ──

describe("generateTotpCode()", () => {
  const secret = base32Encode(Buffer.from("12345678901234567890"));

  it.each([
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
  ])("T=%i → %s", (seconds, code) => {
    expect(generateTotpCode(secret, seconds * 1000)).toBe(code);
    expect(verifyTotpCode(secret, code, seconds * 1000)).toBe(true);
  });
});

describe("base32", () => {
  it("round-trips arbitrary bytes", () => {
    const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
  });

  it("matches the RFC 4648 vector and tolerates case, spaces and padding", () => {
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
    expect(base32Decode("mzxw 6ytb oi======")?.toString()).toBe("foobar");
  });

  it("returns null on characters outside the alphabet", () => {
    expect(base32Decode("ABC1")).toBeNull();
  });
});

// ── generateQrCodeDataUrl ─────────────────────────────────────────────────────

describe("generateQrCodeDataUrl()", () => {
  it("returns a PNG data URL for an otpauth URI", async () => {
    const { otpauthUrl } = generateTotpSecret("qr@example.com");
    const dataUrl = await generateQrCodeDataUrl(otpauthUrl);
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  });
});
