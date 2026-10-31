import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TwoFactorChallenge } from "@/components/auth/two-factor-challenge";

export default async function TwoFactorPage() {
  const session = await auth();
  const hasPasskey = session?.user
    ? (await prisma.passkey.count({ where: { userId: session.user.id } })) > 0
    : false;

  return (
    <Suspense>
      <TwoFactorChallenge hasPasskey={hasPasskey} />
    </Suspense>
  );
}

export const metadata = { title: "Two-Factor Authentication" };
