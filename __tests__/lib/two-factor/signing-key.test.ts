import { describe, it, expect, vi, afterEach } from "vitest";
import { signingKey } from "@/lib/two-factor/signing-key";

afterEach(() => vi.unstubAllEnvs());

describe("signingKey()", () => {
  it("is NEXTAUTH_SECRET as bytes", () => {
    vi.stubEnv("NEXTAUTH_SECRET", "abc");
    expect(new TextDecoder().decode(signingKey())).toBe("abc");
  });

  it("refuses to hand out an empty key", () => {
    vi.stubEnv("NEXTAUTH_SECRET", "");
    expect(() => signingKey()).toThrow(/NEXTAUTH_SECRET/);
  });
});
