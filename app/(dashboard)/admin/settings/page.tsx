import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { readSettings } from "@/lib/app-settings";
import { GeneralSettingsClient } from "@/components/admin/general-settings-client";
import { BrandingSettingsClient } from "@/components/admin/branding-settings-client";
import { ComplianceSettingsClient } from "@/components/admin/compliance-settings-client";
import { WorkLogItemsManager } from "@/components/admin/work-log-items-manager";
import { isAdmin } from "@/lib/permissions";
import { parseBackgroundMode } from "@/lib/background-mode";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) redirect("/");

  const t = await getTranslations("adminPages");

  const map = await readSettings([
    "hostname.urlTemplate",
    "macAddress.urlTemplate",
    "location.urlTemplate",
    "app.title",
    "branding.logoStorageKey",
    "branding.faviconStorageKey",
    "branding.backgroundMode",
    "branding.backgroundStorageKey",
    "security.requireTwoFactor",
    "audit.retentionDays",
    "assets.defaultOwnerId",
    "compliance.reviewWorkLogItemId",
    "compliance.reviewPeriodMonths",
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
          initialHostnameUrlTemplate={map["hostname.urlTemplate"] ?? ""}
          initialMacAddressUrlTemplate={map["macAddress.urlTemplate"] ?? ""}
          initialLocationUrlTemplate={map["location.urlTemplate"] ?? ""}
        />
      </div>

      <div>
        <BrandingSettingsClient
          initialAppTitle={map["app.title"] ?? "SAM"}
          initialHasLogo={!!map["branding.logoStorageKey"]}
          initialHasFavicon={!!map["branding.faviconStorageKey"]}
          initialBackgroundMode={parseBackgroundMode(map["branding.backgroundMode"])}
          initialHasCustomBackground={!!map["branding.backgroundStorageKey"]}
        />
      </div>

      <div>
        <ComplianceSettingsClient
          initialRequireTwoFactor={map["security.requireTwoFactor"] === "true"}
          initialAuditRetentionDays={parseInt(map["audit.retentionDays"] ?? "730", 10)}
          initialDefaultOwnerId={map["assets.defaultOwnerId"] || null}
          initialReviewWorkLogItemId={map["compliance.reviewWorkLogItemId"] || null}
          initialReviewPeriodMonths={parseInt(map["compliance.reviewPeriodMonths"] ?? "12", 10)}
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

export const metadata = { title: "Settings – SAM Admin" };
