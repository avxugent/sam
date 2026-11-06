import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { authIncludingPendingSteps } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TwoFactorChallenge } from "@/components/auth/two-factor-challenge";

export default async function TwoFactorPage() {
  const session = await authIncludingPendingSteps();
  const hasPasskey = session?.user
    ? (await prisma.passkey.count({ where: { userId: session.user.id } })) > 0
    : false;

  return (
    <Suspense>
      <TwoFactorChallenge hasPasskey={hasPasskey} />
    </Suspense>
  );
}

export async function generateMetadata() {
  const t = await getTranslations("auth");
  return { title: t("twoFactorTitle") };
}
