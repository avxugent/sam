import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { UsersClient } from "@/components/admin/users-client";
import { isAdmin } from "@/lib/permissions";

export default async function UsersPage() {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) redirect("/");

  const t = await getTranslations("adminPages");

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, provider: true, totpEnabled: true, mustChangePassword: true, twoFactorRequired: true, lastLoginAt: true, createdAt: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("users.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("users.subtitle")}</p>
      </div>
      <UsersClient
        initialUsers={users.map((u) => ({
          ...u,
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
          createdAt: u.createdAt.toISOString(),
        }))}
        currentUserId={session.user.id}
      />
    </div>
  );
}

export async function generateMetadata() {
  const t = await getTranslations("adminPages");
  return { title: t("users.title") };
}
