/**
 * "Remember this device" cookie shared by every second-factor verify route
 * (TOTP, passkey, …) so a successful challenge from any method skips future
 * 2FA prompts on the same browser for 30 days.
 */
import { NextResponse } from "next/server";
import { SignJWT, jwtVerify } from "jose";

export const REMEMBER_ME_COOKIE = "sam_2fa_rm";
const REMEMBER_DAYS = 30;

function signingSecret() {
  return new TextEncoder().encode(process.env.NEXTAUTH_SECRET ?? "");
}

export async function signRememberMeToken(userId: string): Promise<string> {
  const secret = signingSecret();
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${REMEMBER_DAYS}d`)
    .sign(secret);
}

/** Sets the remember-me cookie on `response` for `userId`, mutating it in place. */
export async function setRememberMeCookie(response: NextResponse, userId: string): Promise<void> {
  const token = await signRememberMeToken(userId);
  response.cookies.set(REMEMBER_ME_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: REMEMBER_DAYS * 24 * 60 * 60,
    secure: process.env.NODE_ENV === "production",
  });
}

/** Whether `token` is a valid, unexpired remember-me token issued for `userId`. */
export async function verifyRememberMeToken(token: string | undefined, userId: string): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, signingSecret());
    return payload.sub === userId;
  } catch {
    return false;
  }
}
