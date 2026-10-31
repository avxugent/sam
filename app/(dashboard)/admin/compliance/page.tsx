import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { computeHostnameCompliance } from "@/lib/compliance/hostname-report";
import { computeNis2Compliance } from "@/lib/compliance/nis2";
import { HostnameComplianceClient } from "@/components/admin/hostname-compliance-client";
import { Nis2DashboardClient } from "@/components/admin/nis2-dashboard-client";
import { isAdmin } from "@/lib/permissions";

export default async function CompliancePage() {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user.role)) redirect("/");

  const t = await getTranslations("compliance");
  const [nis2Result, hostnameResult] = await Promise.all([
    computeNis2Compliance(),
    computeHostnameCompliance(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>
      <Nis2DashboardClient result={nis2Result} />
      <div>
        <div className="mb-4">
          <h2 className="text-[16px] font-bold text-foreground">{t("hostnameSectionTitle")}</h2>
        </div>
        <HostnameComplianceClient result={hostnameResult} />
      </div>
    </div>
  );
}

export const metadata = { title: "Compliance" };
