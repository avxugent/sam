import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { signUpgradeProof } from "@/lib/two-factor/upgrade-proof";

/**
 * Re-issues the session cookie through the internal "credentials-2fa-verified"
 * provider once a route has verified the second factor (or finished forced
 * enrollment), clearing the needs2FA / needs2FASetup flags.
 *
 * Returns false when the provider refuses — e.g. the user was deleted or is
 * no longer a credentials account — so the caller can answer 401 instead of
 * reporting success on a session that still lacks full access.
 */
export async function upgradeSession(userId: string, method: "totp" | "passkey"): Promise<boolean> {
  try {
    await signIn("credentials-2fa-verified", {
      userId,
      method,
      proof: await signUpgradeProof(userId),
      redirect: false,
    });
    return true;
  } catch (err) {
    if (err instanceof AuthError) return false;
    throw err;
  }
}
