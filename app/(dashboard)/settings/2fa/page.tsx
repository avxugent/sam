import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { TwoFactorSettings } from "@/components/auth/two-factor-settings";

export default async function TwoFactorSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { provider: true, totpEnabled: true },
  });
  if (!user) redirect("/login");

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Two-Factor Authentication</h1>
        <p className="text-muted-foreground mt-1">
          Secure your account with a time-based one-time password (TOTP).
        </p>
      </div>
      <TwoFactorSettings
        provider={user.provider}
        totpEnabled={user.totpEnabled}
      />
    </div>
  );
}

export const metadata = { title: "Two-Factor Authentication – SAM" };
