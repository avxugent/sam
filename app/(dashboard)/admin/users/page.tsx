import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { UsersClient } from "@/components/settings/users-client";

export default async function UsersPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/");

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, provider: true, createdAt: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="text-muted-foreground mt-1">Manage user accounts and their roles.</p>
      </div>
      <UsersClient initialUsers={users} currentUserId={session.user.id} />
    </div>
  );
}

export const metadata = { title: "Users – SAM Admin" };
