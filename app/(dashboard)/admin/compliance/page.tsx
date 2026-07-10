import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { computeHostnameCompliance } from "@/lib/hostname-compliance";
import { computeNis2Compliance } from "@/lib/nis2-compliance";
import { HostnameComplianceClient } from "@/components/compliance/hostname-compliance-client";
import { Nis2DashboardClient } from "@/components/compliance/nis2-dashboard-client";

export default async function CompliancePage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/");

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
          <h2 className="text-[16px] font-bold text-[#0f172a]">{t("hostnameSectionTitle")}</h2>
        </div>
        <HostnameComplianceClient result={hostnameResult} />
      </div>
    </div>
  );
}

export const metadata = { title: "Compliance – SAM Admin" };
