import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reportDefinitionSchema } from "@/lib/report-schema";
import { ReportBuilder } from "@/components/reports/ReportBuilder";
import { BarChart2, ChevronLeft } from "lucide-react";
import Link from "next/link";

export default async function EditReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "VIEWER") redirect(`/reports/${id}`);

  const report = await prisma.report.findUnique({ where: { id } });
  if (!report) notFound();

  const parsed = reportDefinitionSchema.safeParse(JSON.parse(report.definition));
  const definition = parsed.success ? parsed.data : undefined;

  const [assetTypes, manufacturers, locations] = await Promise.all([
    prisma.assetType.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.manufacturer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.location.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-[9px] bg-[#e8f0fc] flex items-center justify-center flex-shrink-0">
          <BarChart2 className="h-4 w-4 text-[#1e64c8]" />
        </div>
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Link href={`/reports/${id}`} className="text-[12px] text-[#64748b] hover:text-[#1e64c8] flex items-center gap-0.5">
              <ChevronLeft className="h-3 w-3" />
              {report.name}
            </Link>
          </div>
          <h1 className="text-[22px] font-bold text-[#0f172a] tracking-[-0.01em]">Edit Report</h1>
        </div>
      </div>

      <ReportBuilder
        reportId={id}
        initialName={report.name}
        initialDescription={report.description ?? ""}
        initialDefinition={definition}
        assetTypes={assetTypes}
        manufacturers={manufacturers}
        locations={locations}
      />
    </div>
  );
}
