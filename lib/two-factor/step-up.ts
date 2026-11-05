/**
 * Step-up confirmation for removing a second factor while signed in: the
 * current TOTP code (when TOTP is enabled), or a fresh WebAuthn assertion
 * from one of the user's passkeys, issued by /api/auth/passkey/confirmation-options.
 */
import type { NextRequest } from "next/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyTotpCode } from "@/lib/two-factor/totp";
import { readChallengeCookie, verifyAuthentication } from "@/lib/two-factor/webauthn";

export const stepUpSchema = z.union([
  z.object({ code: z.string().length(6) }),
  z.object({ response: z.record(z.string(), z.unknown()) }),
]);

export type StepUpProof = z.infer<typeof stepUpSchema>;

/** Whether `proof` confirms that `userId` holds one of their second factors right now. */
export async function confirmSecondFactor(req: NextRequest, userId: string, proof: StepUpProof): Promise<boolean> {
  if ("code" in proof) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { totpEnabled: true, totpSecret: true },
    });
    return !!user?.totpEnabled && !!user.totpSecret && verifyTotpCode(user.totpSecret, proof.code);
  }

  const challenge = await readChallengeCookie(req, userId, "confirmation");
  if (!challenge) return false;
  const credentialId = proof.response.id;
  if (typeof credentialId !== "string") return false;
  const passkey = await prisma.passkey.findUnique({ where: { credentialId } });
  if (!passkey || passkey.userId !== userId) return false;

  const { verified, newCounter } = await verifyAuthentication(
    proof.response as unknown as AuthenticationResponseJSON,
    challenge,
    passkey
  );
  if (!verified) return false;
  await prisma.passkey.update({
    where: { id: passkey.id },
    data: { counter: newCounter, lastUsedAt: new Date() },
  });
  return true;
}
