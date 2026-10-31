import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { readBrandingSettings, readComplianceSettings, readGeneralSettings } from "@/lib/app-settings";
import { GeneralSettingsClient } from "@/components/admin/general-settings-client";
import { BrandingSettingsClient } from "@/components/admin/branding-settings-client";
import { ComplianceSettingsClient } from "@/components/admin/compliance-settings-client";
import { WorkLogItemsManager } from "@/components/admin/work-log-items-manager";
import { isAdmin } from "@/lib/permissions";
import { parseBackgroundMode } from "@/lib/branding/background-mode";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) redirect("/");

  const t = await getTranslations("adminPages");

  const [general, branding, compliance] = await Promise.all([
    readGeneralSettings(),
    readBrandingSettings(),
    readComplianceSettings(),
  ]);

  const workLogItems = await prisma.workLogItem.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: { _count: { select: { workLogs: true } } },
  });

  const users = await prisma.user.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold">{t("settings.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("settings.subtitle")}</p>
        </div>
        <GeneralSettingsClient
          initialHostnameUrlTemplate={general.hostnameUrlTemplate}
          initialMacAddressUrlTemplate={general.macAddressUrlTemplate}
          initialLocationUrlTemplate={general.locationUrlTemplate}
        />
      </div>

      <div>
        <BrandingSettingsClient
          initialAppTitle={branding.appTitle}
          initialHasLogo={branding.hasLogo}
          initialHasFavicon={branding.hasFavicon}
          initialBackgroundMode={parseBackgroundMode(branding.backgroundMode)}
          initialHasCustomBackground={branding.hasCustomBackground}
        />
      </div>

      <div>
        <ComplianceSettingsClient
          initialRequireTwoFactor={compliance.requireTwoFactor}
          initialAuditRetentionDays={compliance.auditRetentionDays}
          initialDefaultOwnerId={compliance.defaultOwnerId}
          initialReviewWorkLogItemId={compliance.reviewWorkLogItemId}
          initialReviewPeriodMonths={compliance.reviewPeriodMonths}
          users={users}
          workLogItems={workLogItems.map((i) => ({ id: i.id, name: i.name }))}
        />
      </div>

      <div>
        <div className="mb-6">
          <h2 className="text-xl font-bold">{t("workLogItems.title")}</h2>
          <p className="text-muted-foreground mt-1">{t("workLogItems.subtitle")}</p>
        </div>
        <WorkLogItemsManager initialItems={workLogItems} />
      </div>

    </div>
  );
}

export const metadata = { title: "Settings" };
