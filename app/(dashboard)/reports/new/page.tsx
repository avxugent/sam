import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { loadReportBuilderOptions } from "@/lib/reports/builder-options";
import { ReportBuilder } from "@/components/reports/report-builder";
import { BarChart2 } from "lucide-react";
import { canEdit } from "@/lib/permissions";
import { PageHeader } from "@/components/layout/page-header";

export async function generateMetadata() {
  const t = await getTranslations("report");
  return { title: t("newReport") };
}

export default async function NewReportPage() {
  const session = await auth();
  const t = await getTranslations("report");
  if (!session?.user) redirect("/login");
  if (!canEdit(session.user.role)) redirect("/reports");

  const options = await loadReportBuilderOptions();

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader icon={BarChart2} title={t("newReport")} subtitle={t("newSubtitle")} />

      <ReportBuilder {...options} />
    </div>
  );
}
