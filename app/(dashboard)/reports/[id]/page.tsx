import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runReport } from "@/lib/report-engine";
import { reportDefinitionSchema } from "@/lib/report-schema";
import { ReportViewer } from "@/components/reports/ReportViewer";
import { BarChart2 } from "lucide-react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();

  const report = await prisma.report.findUnique({ where: { id } });
  if (!report) notFound();

  const parsed = reportDefinitionSchema.safeParse(JSON.parse(report.definition));
  if (!parsed.success) {
    return (
      <div className="p-6 text-destructive text-sm">
        Report definition is invalid. Please edit and re-save this report.
      </div>
    );
  }

  const definition = parsed.data;
  const result = await runReport(definition);
  const canEdit = session?.user?.role === "ADMIN" || session?.user?.role === "EDITOR";
  const grafanaUrl = process.env.GRAFANA_URL
    ? `${process.env.GRAFANA_URL}/explore`
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-[9px] bg-[#e8f0fc] flex items-center justify-center flex-shrink-0">
          <BarChart2 className="h-4 w-4 text-[#1e64c8]" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <Link href="/reports" className="text-[12px] text-[#64748b] hover:text-[#1e64c8] flex items-center gap-0.5">
              <ChevronLeft className="h-3 w-3" />
              Reports
            </Link>
          </div>
          <h1 className="text-[22px] font-bold text-[#0f172a] tracking-[-0.01em] truncate">{report.name}</h1>
          {report.description && (
            <p className="text-[13px] text-[#64748b] mt-0.5">{report.description}</p>
          )}
        </div>
      </div>

      <ReportViewer
        reportId={report.id}
        reportName={report.name}
        columns={definition.columns}
        result={result}
        canEdit={canEdit}
        grafanaUrl={grafanaUrl}
      />
    </div>
  );
}
