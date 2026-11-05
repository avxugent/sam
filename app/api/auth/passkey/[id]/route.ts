/**
 * DELETE /api/auth/passkey/[id]
 *
 * Removes one of the current user's registered passkeys. Passkeys are
 * always self-managed — there is no admin-override case (unlike
 * /api/auth/2fa/disable).
 *
 * Like disabling TOTP, removal needs a fresh second-factor confirmation:
 * Body: { code: string } — the current TOTP code (when TOTP is enabled), or
 *       { response: AuthenticationResponseJSON } — an assertion for the
 *       options from /api/auth/passkey/confirmation-options.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { invalidInput, isRecordNotFoundError, notFoundResponse, readJsonBody } from "@/lib/route-helpers";
import { consumeRateLimit } from "@/lib/rate-limit";
import { clientIp, tooManyAttemptsResponse } from "@/lib/rate-limit/http";
import { confirmSecondFactor, stepUpSchema } from "@/lib/two-factor/step-up";
import { clearChallengeCookie } from "@/lib/two-factor/webauthn";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const passkey = await prisma.passkey.findUnique({ where: { id } });

  // 404 (not 403) for another user's passkey — don't confirm it exists.
  if (!passkey || passkey.userId !== session.user.id) {
    return notFoundResponse("Passkey");
  }

  // Rate-limited so a hijacked session cannot brute-force the TOTP code here.
  const ip = clientIp(req.headers) ?? "unknown";
  const rl = consumeRateLimit(`passkey-remove:${session.user.id}:${ip}`, 10, 15 * 60 * 1000);
  if (!rl.allowed) return tooManyAttemptsResponse(rl.retryAfterMs);

  const parsed = stepUpSchema.safeParse(await readJsonBody(req));
  if (!parsed.success) {
    return invalidInput(parsed.error, "Confirm with your current 2FA code or a passkey.");
  }

  if (!(await confirmSecondFactor(req, session.user.id, parsed.data))) {
    const response = NextResponse.json({ error: "Confirmation failed." }, { status: 400 });
    clearChallengeCookie(response);
    return response;
  }

  try {
    await prisma.passkey.delete({ where: { id } });
  } catch (err) {
    if (isRecordNotFoundError(err)) return notFoundResponse("Passkey");
    throw err;
  }

  await logAudit({
    session,
    req,
    action: "DELETE",
    entityType: "User",
    entityId: session.user.id,
    entityName: session.user.email,
    detail: { event: "Passkey removed", label: passkey.label },
  });

  const response = NextResponse.json({ ok: true });
  clearChallengeCookie(response);
  return response;
}
