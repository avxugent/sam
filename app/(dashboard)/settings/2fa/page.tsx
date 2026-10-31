import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { TwoFactorSettings } from "@/components/auth/two-factor-settings";
import { PasskeySettings } from "@/components/auth/passkey-settings";
import { getTranslations } from "next-intl/server";

export default async function TwoFactorSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { provider: true, totpEnabled: true },
  });
  if (!user) redirect("/login");
  const t = await getTranslations("settings");

  const passkeys = await prisma.passkey.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, label: true, deviceType: true, backedUp: true, createdAt: true, lastUsedAt: true },
  });

  return (
    <div className="max-w-lg space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("twoFactorPageTitle")}</h1>
        <p className="text-muted-foreground mt-1">{t("twoFactorPageSubtitle")}</p>
      </div>
      <TwoFactorSettings
        provider={user.provider}
        totpEnabled={user.totpEnabled}
      />
      <PasskeySettings
        provider={user.provider}
        passkeys={passkeys.map((p) => ({ ...p, createdAt: p.createdAt.toISOString(), lastUsedAt: p.lastUsedAt?.toISOString() ?? null }))}
      />
    </div>
  );
}

export async function generateMetadata() {
  const t = await getTranslations("settings");
  return { title: t("twoFactorPageTitle") };
}
