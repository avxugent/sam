import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { computeHostnameCompliance } from "@/lib/hostname-compliance";
import { HostnameComplianceClient } from "@/components/compliance/hostname-compliance-client";

export default async function CompliancePage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/");

  const t = await getTranslations("compliance");
  const result = await computeHostnameCompliance();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>
      <HostnameComplianceClient result={result} />
    </div>
  );
}

export const metadata = { title: "Hostname compliance – SAM Admin" };
