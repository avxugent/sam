import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { Session } from "next-auth";
import { REMEMBER_ME_COOKIE, verifyRememberMeToken } from "@/lib/two-factor/remember-device";

/** A login step a session still owes before it has full access. */
export type SignInStep = "password-change" | "2fa-setup" | "2fa";

/**
 * The step `session` still owes, or null when sign-in is complete. A pending
 * second factor is waived on a browser with a valid remember-device token.
 * Used by auth() in lib/auth.ts (which hides such sessions), by proxy.ts
 * (redirects) and by the login-step routes.
 */
export async function pendingSignInStep(
  session: Session,
  rememberMeToken: string | undefined
): Promise<SignInStep | null> {
  if (session.needsPasswordChange) return "password-change";
  if (session.needs2FASetup) return "2fa-setup";
  if (session.needs2FA && !(await verifyRememberMeToken(rememberMeToken, session.user.id))) return "2fa";
  return null;
}

/**
 * 403 when the session is only partly signed in (password passed, a forced
 * step still pending), unless that step is in `allowed`. For the login-step
 * routes, which read the session with authIncludingPendingSteps().
 */
export async function signInIncompleteResponse(
  session: Session,
  allowed: SignInStep[] = []
): Promise<NextResponse | null> {
  if (!session.needsPasswordChange && !session.needs2FASetup && !session.needs2FA) return null;
  const rememberMeToken = session.needs2FA ? (await cookies()).get(REMEMBER_ME_COOKIE)?.value : undefined;
  const step = await pendingSignInStep(session, rememberMeToken);
  if (!step || allowed.includes(step)) return null;
  return NextResponse.json({ error: "Sign-in is not complete." }, { status: 403 });
}
