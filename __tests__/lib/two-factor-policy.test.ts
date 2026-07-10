import { describe, it, expect } from "vitest";
import { isTwoFactorSetupRequired } from "@/lib/two-factor-policy";

describe("isTwoFactorSetupRequired()", () => {
  it("requires setup when the per-user flag is set and TOTP is not enabled", () => {
    expect(isTwoFactorSetupRequired({ twoFactorRequired: true, totpEnabled: false }, null)).toBe(true);
  });

  it("requires setup when the global setting is on and TOTP is not enabled", () => {
    expect(isTwoFactorSetupRequired({ twoFactorRequired: false, totpEnabled: false }, "true")).toBe(true);
  });

  it("does not require setup when TOTP is already enabled, regardless of flags", () => {
    expect(isTwoFactorSetupRequired({ twoFactorRequired: true, totpEnabled: true }, "true")).toBe(false);
    expect(isTwoFactorSetupRequired({ twoFactorRequired: false, totpEnabled: true }, "true")).toBe(false);
  });

  it("does not require setup when neither flag nor setting is on", () => {
    expect(isTwoFactorSetupRequired({ twoFactorRequired: false, totpEnabled: false }, null)).toBe(false);
    expect(isTwoFactorSetupRequired({ twoFactorRequired: false, totpEnabled: false }, undefined)).toBe(false);
  });

  it("treats any setting value other than 'true' as off", () => {
    expect(isTwoFactorSetupRequired({ twoFactorRequired: false, totpEnabled: false }, "false")).toBe(false);
    expect(isTwoFactorSetupRequired({ twoFactorRequired: false, totpEnabled: false }, "1")).toBe(false);
    expect(isTwoFactorSetupRequired({ twoFactorRequired: false, totpEnabled: false }, "")).toBe(false);
  });
});
