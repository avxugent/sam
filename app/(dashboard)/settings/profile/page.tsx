import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ProfileClient } from "@/components/settings/profile-client";

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
        provider={user.provider}
        locationDefaultTab={user.locationDefaultTab}
      />
    </div>
  );
}

export async function generateMetadata() {
  const t = await getTranslations("settings");
  return { title: t("profileTitle") };
}
