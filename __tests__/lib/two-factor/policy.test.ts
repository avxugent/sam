import { describe, it, expect } from "vitest";
import { isTwoFactorSetupRequired } from "@/lib/two-factor/policy";

describe("isTwoFactorSetupRequired()", () => {
  it("requires setup when the per-user flag is set and TOTP is not enabled", () => {
    expect(isTwoFactorSetupRequired({ twoFactorRequired: true, totpEnabled: false, hasPasskey: false }, false)).toBe(true);
  });

  it("requires setup when the global setting is on and TOTP is not enabled", () => {
    expect(isTwoFactorSetupRequired({ twoFactorRequired: false, totpEnabled: false, hasPasskey: false }, true)).toBe(true);
  });

  it("does not require setup when TOTP is already enabled, regardless of flags", () => {
    expect(isTwoFactorSetupRequired({ twoFactorRequired: true, totpEnabled: true, hasPasskey: false }, true)).toBe(false);
    expect(isTwoFactorSetupRequired({ twoFactorRequired: false, totpEnabled: true, hasPasskey: false }, true)).toBe(false);
  });

  it("does not require setup when a passkey is already registered, regardless of flags", () => {
    expect(isTwoFactorSetupRequired({ twoFactorRequired: true, totpEnabled: false, hasPasskey: true }, true)).toBe(false);
    expect(isTwoFactorSetupRequired({ twoFactorRequired: false, totpEnabled: false, hasPasskey: true }, true)).toBe(false);
  });

  it("still requires setup when neither TOTP nor a passkey is set up", () => {
    expect(isTwoFactorSetupRequired({ twoFactorRequired: true, totpEnabled: false, hasPasskey: false }, true)).toBe(true);
  });

  it("does not require setup when neither flag nor setting is on", () => {
    expect(isTwoFactorSetupRequired({ twoFactorRequired: false, totpEnabled: false, hasPasskey: false }, false)).toBe(false);
  });

});
