/**
 * HMAC key for the tokens the 2FA flow signs itself (remember-device cookie,
 * WebAuthn challenge cookie, upgrade proof): NEXTAUTH_SECRET, the session
 * secret. Throws when it is unset, so nothing is ever signed or verified
 * with an empty key; the verify helpers catch that and fail closed.
 */
export function signingKey(): Uint8Array {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is not set; refusing to sign or verify 2FA tokens.");
  return new TextEncoder().encode(secret);
}
