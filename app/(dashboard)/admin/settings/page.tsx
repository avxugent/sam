import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { GeneralSettingsClient } from "@/components/settings/general-settings-client";
import { BrandingSettingsClient } from "@/components/settings/branding-settings-client";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/");

  const settings = await prisma.appSetting.findMany({
    where: {
      key: {
        in: [
          "hostname.urlTemplate",
          "macAddress.urlTemplate",
          "app.title",
          "branding.logoStorageKey",
          "branding.faviconStorageKey",
          "branding.backgroundMode",
          "branding.backgroundStorageKey",
        ],
      },
    },
  });
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground mt-1">General application configuration.</p>
        </div>
        <GeneralSettingsClient
          initialHostnameUrlTemplate={map["hostname.urlTemplate"] ?? ""}
          initialMacAddressUrlTemplate={map["macAddress.urlTemplate"] ?? ""}
        />
      </div>

      <div>
        <BrandingSettingsClient
          initialAppTitle={map["app.title"] ?? "SAM"}
          initialHasLogo={!!map["branding.logoStorageKey"]}
          initialHasFavicon={!!map["branding.faviconStorageKey"]}
          initialBackgroundMode={map["branding.backgroundMode"] ?? ""}
          initialHasCustomBackground={!!map["branding.backgroundStorageKey"]}
        />
      </div>
    </div>
  );
}

export const metadata = { title: "Settings – SAM Admin" };
