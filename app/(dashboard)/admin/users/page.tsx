import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { UsersClient } from "@/components/settings/users-client";
import { isAdmin } from "@/lib/permissions";

export default async function UsersPage() {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) redirect("/");

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, provider: true, totpEnabled: true, mustChangePassword: true, twoFactorRequired: true, lastLoginAt: true, createdAt: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="text-muted-foreground mt-1">Manage user accounts and their roles.</p>
      </div>
      <UsersClient initialUsers={users} currentUserId={session.user.id} />
    </div>
  );
}

export const metadata = { title: "Users – SAM Admin" };
