import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
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
      theme: true,
    },
  });
  if (!user) redirect("/login");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Profile</h1>
        <p className="text-muted-foreground mt-1">
          Manage your display name and password.
        </p>
      </div>
      <ProfileClient
        name={user.name}
        email={user.email}
        provider={user.provider}
        locationDefaultTab={user.locationDefaultTab}
        serverTheme={user.theme}
      />
    </div>
  );
}

export const metadata = { title: "Profile – SAM" };
