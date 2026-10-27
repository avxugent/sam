/**
 * Proof that a route handler has just verified a user's second factor (or
 * completed forced enrollment). The internal "credentials-2fa-verified"
 * provider is reachable over HTTP at /api/auth/callback/…, so it must not
 * trust a bare userId: it only accepts this server-signed, short-lived token,
 * which never leaves the server.
 */
import { SignJWT, jwtVerify } from "jose";

const AUDIENCE = "sam-2fa-upgrade";

function signingSecret() {
  return new TextEncoder().encode(process.env.NEXTAUTH_SECRET ?? "");
}

export async function signUpgradeProof(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(signingSecret());
}

/** Whether `proof` is a valid, unexpired upgrade proof issued for `userId`. */
export async function verifyUpgradeProof(proof: unknown, userId: string): Promise<boolean> {
  if (typeof proof !== "string" || !proof) return false;
  try {
    const { payload } = await jwtVerify(proof, signingSecret(), { audience: AUDIENCE });
    return payload.sub === userId;
  } catch {
    return false;
  }
}
