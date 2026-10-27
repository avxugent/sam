import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runReport } from "@/lib/reports/engine";
import { parseReportDefinition } from "@/lib/schemas/report";
import { ReportViewer } from "@/components/reports/report-viewer";
import { LocationReportViewer } from "@/components/reports/location-report-viewer";
import { isLocationReport } from "@/lib/reports/types";
import { BarChart2 } from "lucide-react";
import { canEdit } from "@/lib/permissions";
import { PageHeader } from "@/components/layout/page-header";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const t = await getTranslations("report");

  const report = await prisma.report.findUnique({ where: { id } });
  if (!report) notFound();

  const definition = parseReportDefinition(report.definition);
  if (!definition) {
    return (
      <div className="p-6 text-destructive text-sm">
        {t("invalidDefinition")}
      </div>
    );
  }

  const result = await runReport(definition);
  const userCanEdit = canEdit(session?.user?.role);
  const grafanaUrl = process.env.GRAFANA_URL
    ? `${process.env.GRAFANA_URL}/explore`
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={BarChart2}
        title={report.name}
        subtitle={report.description}
        back={{ href: "/reports", label: t("title") }}
      />

      {isLocationReport(definition) ? (
        result.source === "location" && (
          <LocationReportViewer
            reportId={report.id}
            reportName={report.name}
            result={result}
            canEdit={userCanEdit}
          />
        )
      ) : (
        result.source === "asset" && (
          <ReportViewer
            reportId={report.id}
            reportName={report.name}
            columns={definition.columns}
            result={result}
            canEdit={userCanEdit}
            grafanaUrl={grafanaUrl}
          />
        )
      )}
    </div>
  );
}
