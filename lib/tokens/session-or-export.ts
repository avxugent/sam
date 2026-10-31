import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { signInIncompleteResponse } from "@/lib/two-factor/sign-in-steps";
import { hasBearerToken } from "@/lib/tokens/bearer";

/**
 * Auth for the /api/export/* routes: a valid EXPORT_TOKEN Bearer (external
 * cron), or a fully signed-in admin session. Returns the session (null for a
 * token request; the audit entry then has no user) or the 401/403 to send.
 */
export async function adminSessionOrExportToken(
  req: Request
): Promise<{ session: Session | null } | { error: NextResponse }> {
  const session = await auth();
  if (hasBearerToken(req, process.env.EXPORT_TOKEN)) return { session };
  if (!session?.user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const incomplete = await signInIncompleteResponse(session);
  if (incomplete) return { error: incomplete };
  if (!isAdmin(session.user.role)) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { session };
}
