/**
 * Pure decision logic for forced 2FA enrollment, used by the credentials
 * authorize() step in lib/auth.ts.
 *
 * Applies to credentials users only — Entra ID logins never reach the
 * credentials authorize() flow and their MFA is enforced by Entra itself.
 */
export function isTwoFactorSetupRequired(
  user: { twoFactorRequired: boolean; totpEnabled: boolean; hasPasskey: boolean },
  globallyRequired: boolean
): boolean {
  return (user.twoFactorRequired || globallyRequired) && !user.totpEnabled && !user.hasPasskey;
}
