/**
 * Pure decision logic for forced 2FA enrollment, kept out of lib/auth.ts
 * (which is excluded from coverage) so it can be unit-tested.
 *
 * Applies to credentials users only — Entra ID logins never reach the
 * credentials authorize() flow and their MFA is enforced by Entra itself.
 */
export function isTwoFactorSetupRequired(
  user: { twoFactorRequired: boolean; totpEnabled: boolean; hasPasskey: boolean },
  globalRequireSetting: string | null | undefined
): boolean {
  const globallyRequired = globalRequireSetting === "true";
  return (user.twoFactorRequired || globallyRequired) && !user.totpEnabled && !user.hasPasskey;
}
