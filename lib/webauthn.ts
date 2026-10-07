/**
 * WebAuthn (passkey) helpers — an alternative second factor to TOTP.
 * Thin wrapper around @simplewebauthn/server, same spirit as lib/totp.ts.
 * No NextAuth Adapter/provider is involved anywhere in this app; these
 * functions are called directly from the app/api/auth/passkey/* routes.
 */
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL, isoUint8Array } from "@simplewebauthn/server/helpers";
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from "@simplewebauthn/server";
import { APP_NAME } from "@/lib/totp";
import { SignJWT, jwtVerify } from "jose";
import type { NextRequest, NextResponse } from "next/server";

export function getRpConfig(): { rpName: string; rpID: string; origin: string } {
  const url = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return {
    rpName: APP_NAME,
    rpID: new URL(url).hostname,
    origin: url,
  };
}

type StoredPasskey = {
  credentialId: string;
  transports: string | null;
};

function parseTransports(transports: string | null): string[] | undefined {
  if (!transports) return undefined;
  try {
    return JSON.parse(transports);
  } catch {
    return undefined;
  }
}

// `id` is a base64url string, matching how credentialId is already stored —
// v10+ dropped the Uint8Array id / explicit `type: "public-key"` requirement
// that earlier versions needed here.
function toCredentialDescriptor(passkey: StoredPasskey): { id: string; transports?: string[] } {
  return {
    id: passkey.credentialId,
    transports: parseTransports(passkey.transports),
  };
}

export async function buildRegistrationOptions(
  user: { id: string; email: string; name: string },
  existingPasskeys: StoredPasskey[]
) {
  const { rpName, rpID } = getRpConfig();
  return generateRegistrationOptions({
    rpName,
    rpID,
    // v10+ requires userID as bytes rather than a plain string.
    userID: isoUint8Array.fromUTF8String(user.id),
    userName: user.email,
    userDisplayName: user.name,
    attestationType: "none",
    excludeCredentials: existingPasskeys.map(toCredentialDescriptor),
    authenticatorSelection: {
      residentKey: "discouraged",
      userVerification: "preferred",
    },
  });
}

export type VerifiedRegistration = {
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string | null;
  deviceType: string;
  backedUp: boolean;
};

/** Returns null when the response fails or errors during verification. */
export async function verifyRegistration(
  response: RegistrationResponseJSON,
  expectedChallenge: string
): Promise<VerifiedRegistration | null> {
  const { rpID, origin } = getRpConfig();
  let result;
  try {
    result = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      // Registration options request userVerification: "preferred", not
      // "required" — this is a second factor on top of a password, so the
      // library's own default (requireUserVerification: true) would wrongly
      // reject a registration where the authenticator legitimately skipped UV.
      requireUserVerification: false,
    });
  } catch {
    // @simplewebauthn/server throws (rather than returning verified: false)
    // for malformed/unexpected responses — treat those the same as a failed
    // verification instead of letting them crash the route.
    return null;
  }
  if (!result.verified || !result.registrationInfo) return null;

  // v11+ nests the credential id/publicKey/counter under `credential`;
  // deviceType/backedUp stay top-level on registrationInfo. `credential.id`
  // is already a base64url string — only publicKey (raw COSE key bytes)
  // needs encoding.
  const { credential, credentialDeviceType, credentialBackedUp } = result.registrationInfo;

  return {
    credentialId: credential.id,
    publicKey: isoBase64URL.fromBuffer(credential.publicKey),
    counter: credential.counter,
    transports: response.response.transports ? JSON.stringify(response.response.transports) : null,
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
  };
}

export async function buildAuthenticationOptions(existingPasskeys: StoredPasskey[]) {
  const { rpID } = getRpConfig();
  return generateAuthenticationOptions({
    rpID,
    allowCredentials: existingPasskeys.map(toCredentialDescriptor),
    userVerification: "discouraged", // asserting as part of a 2FA flow, not standalone login
  });
}

export type VerifiedAuthentication = { verified: boolean; newCounter: number };

export async function verifyAuthentication(
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
  storedPasskey: { credentialId: string; publicKey: string; counter: number; transports: string | null }
): Promise<VerifiedAuthentication> {
  const { rpID, origin } = getRpConfig();
  try {
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      // v11+ renamed the `authenticator` option to `credential`, and its id
      // field to a base64url string (publicKey stays raw bytes).
      credential: {
        id: storedPasskey.credentialId,
        publicKey: isoBase64URL.toBuffer(storedPasskey.publicKey),
        counter: storedPasskey.counter,
        transports: parseTransports(storedPasskey.transports),
      },
      // Authentication options request userVerification: "discouraged" — this
      // is a second factor on top of a password, so the library's own default
      // (requireUserVerification: true) would wrongly reject an assertion
      // where the authenticator legitimately skipped UV.
      requireUserVerification: false,
    });
    return { verified: result.verified, newCounter: result.authenticationInfo.newCounter };
  } catch {
    // @simplewebauthn/server throws (rather than returning verified: false)
    // for malformed/unexpected responses — treat those the same as a failed
    // verification instead of letting them crash the route. Keep the stored
    // counter unchanged since nothing was actually verified.
    return { verified: false, newCounter: storedPasskey.counter };
  }
}

// ── Challenge cookie ────────────────────────────────────────────────────────
// WebAuthn requires the exact challenge issued by "options" to round-trip to
// "verify". This app has no server-side session/cache store beyond JWT +
// cookies, so the challenge rides in a short-lived signed cookie — the same
// pattern already used for the "remember this device" cookie
// (lib/remember-device.ts). `purpose` binds the cookie to one call type so a
// registration challenge can't be replayed against the authentication-verify
// route or vice versa.

const CHALLENGE_COOKIE = "sam_webauthn_challenge";
const CHALLENGE_TTL_SECONDS = 5 * 60;

export type ChallengePurpose = "registration" | "authentication";

export async function setChallengeCookie(
  response: NextResponse,
  userId: string,
  purpose: ChallengePurpose,
  challenge: string
): Promise<void> {
  const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET ?? "");
  const token = await new SignJWT({ challenge, userId, purpose })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${CHALLENGE_TTL_SECONDS}s`)
    .sign(secret);
  response.cookies.set(CHALLENGE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: CHALLENGE_TTL_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
}

/** Single-use: call unconditionally in every verify route, success or failure. */
export function clearChallengeCookie(response: NextResponse): void {
  response.cookies.set(CHALLENGE_COOKIE, "", { maxAge: 0, path: "/" });
}

export async function readChallengeCookie(
  req: NextRequest,
  userId: string,
  purpose: ChallengePurpose
): Promise<string | null> {
  const token = req.cookies.get(CHALLENGE_COOKIE)?.value;
  if (!token) return null;
  try {
    const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET ?? "");
    const { payload } = await jwtVerify(token, secret);
    if (payload.userId !== userId || payload.purpose !== purpose) return null;
    return typeof payload.challenge === "string" ? payload.challenge : null;
  } catch {
    return null;
  }
}
