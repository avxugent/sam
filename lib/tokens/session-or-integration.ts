import type { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import type { Role } from "@/lib/permissions";
import { integrationTokenResponse } from "@/lib/tokens/integration";

/**
 * Auth for integration endpoints that people may also open in the browser:
 * a fully signed-in session whose role passes `sessionAllowed`, or else the
 * integration Bearer token. auth() never returns a partly signed-in session
 * (still owing a login step), which matters here: these routes are exempt
 * from the proxy redirect.
 * Returns null when the request may proceed.
 */
export async function sessionOrIntegrationTokenResponse(
  req: Request,
  sessionAllowed: (role: Role) => boolean
): Promise<NextResponse | null> {
  const session = await auth();
  if (session?.user && sessionAllowed(session.user.role)) {
    return null;
  }
  return integrationTokenResponse(req);
}
