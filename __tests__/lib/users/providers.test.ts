import { describe, it, expect } from "vitest";
import { parseAuthProvider } from "@/lib/users/providers";

describe("parseAuthProvider()", () => {
  it("keeps a known provider", () => {
    expect(parseAuthProvider("credentials")).toBe("credentials");
    expect(parseAuthProvider("microsoft-entra-id")).toBe("microsoft-entra-id");
  });

  it("falls back to the column default for unknown or missing values", () => {
    expect(parseAuthProvider("ldap")).toBe("credentials");
    expect(parseAuthProvider(null)).toBe("credentials");
    expect(parseAuthProvider(undefined)).toBe("credentials");
  });
});
