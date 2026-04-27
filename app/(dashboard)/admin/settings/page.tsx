import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { GeneralSettingsClient } from "@/components/settings/general-settings-client";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/");

  const setting = await prisma.appSetting.findUnique({
    where: { key: "hostname.urlTemplate" },
  });

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">General application configuration.</p>
      </div>
      <GeneralSettingsClient initialHostnameUrlTemplate={setting?.value ?? ""} />
    </div>
  );
}

export const metadata = { title: "Settings – SAM Admin" };
