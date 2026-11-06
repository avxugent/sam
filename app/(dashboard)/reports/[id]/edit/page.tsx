import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadReportBuilderOptions } from "@/lib/reports/builder-options";
import { parseReportDefinition } from "@/lib/schemas/report";
import { ReportBuilder } from "@/components/reports/report-builder";
import { BarChart2 } from "lucide-react";
import { canEdit } from "@/lib/permissions";
import { PageHeader } from "@/components/layout/page-header";

export default async function EditReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const t = await getTranslations("report");
  if (!session?.user) redirect("/login");
  if (!canEdit(session.user.role)) redirect(`/reports/${id}`);

  const report = await prisma.report.findUnique({ where: { id } });
  if (!report) notFound();

  const definition = parseReportDefinition(report.definition) ?? undefined;

  const options = await loadReportBuilderOptions();

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader icon={BarChart2} title={t("editReport")} back={{ href: `/reports/${id}`, label: report.name }} />

      <ReportBuilder
        reportId={id}
        initialName={report.name}
        initialDescription={report.description ?? ""}
        initialDefinition={definition}
        {...options}
      />
    </div>
  );
}
