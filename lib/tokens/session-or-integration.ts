import type { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import type { Role } from "@/lib/permissions";
import { signInIncompleteResponse } from "@/lib/two-factor/sign-in-steps";
import { integrationTokenResponse } from "@/lib/tokens/integration";

/**
 * Auth for integration endpoints that people may also open in the browser:
 * a fully signed-in session whose role passes `sessionAllowed`, or else the
 * integration Bearer token. These routes are exempt from the proxy redirect,
 * so a partly signed-in session (still owing a login step) never counts.
 * Returns null when the request may proceed.
 */
export async function sessionOrIntegrationTokenResponse(
  req: Request,
  sessionAllowed: (role: Role) => boolean
): Promise<NextResponse | null> {
  const session = await auth();
  if (session?.user && sessionAllowed(session.user.role) && !(await signInIncompleteResponse(session))) {
    return null;
  }
  return integrationTokenResponse(req);
}
