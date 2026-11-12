import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ProfileClient } from "@/components/settings/profile-client";
import { ApiKeysSettings } from "@/components/settings/api-keys-settings";
import { parseAuthProvider } from "@/lib/users/providers";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      provider: true,
      locationDefaultTab: true,
    },
  });
  if (!user) redirect("/login");
  const apiKeys = await prisma.apiKey.findMany({
    where: { userId: session.user.id },
    select: { id: true, label: true, keyPrefix: true, createdAt: true, lastUsedAt: true, expiresAt: true },
    orderBy: { createdAt: "desc" },
  });
  const t = await getTranslations("settings");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("profileTitle")}</h1>
        <p className="text-muted-foreground mt-1">{t("profilePageSubtitle")}</p>
      </div>
      <ProfileClient
        name={user.name}
        email={user.email}
        provider={parseAuthProvider(user.provider)}
        locationDefaultTab={user.locationDefaultTab}
      />
      <div className="mt-6 max-w-lg">
        <ApiKeysSettings
          keys={apiKeys.map((k) => ({
            ...k,
            createdAt: k.createdAt.toISOString(),
            lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
            expiresAt: k.expiresAt?.toISOString() ?? null,
          }))}
        />
      </div>
    </div>
  );
}

export async function generateMetadata() {
  const t = await getTranslations("settings");
  return { title: t("profileTitle") };
}
