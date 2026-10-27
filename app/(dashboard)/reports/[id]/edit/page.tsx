import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildLocationPathsFromRows } from "@/lib/location-path";
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

  const [assetTypes, manufacturers, locations, workLogItems, suppliers] = await Promise.all([
    prisma.assetType.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.manufacturer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.location.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, parentId: true } }),
    prisma.workLogItem.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const locationPaths = buildLocationPathsFromRows(locations, " › ");
  const locationScopeOptions = locations.map((l) => ({ id: l.id, name: locationPaths.get(l.id) ?? l.name }));

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader icon={BarChart2} title={t("editReport")} back={{ href: `/reports/${id}`, label: report.name }} />

      <ReportBuilder
        reportId={id}
        initialName={report.name}
        initialDescription={report.description ?? ""}
        initialDefinition={definition}
        assetTypes={assetTypes}
        manufacturers={manufacturers}
        locations={locations}
        locationScopeOptions={locationScopeOptions}
        workLogItems={workLogItems}
        suppliers={suppliers}
      />
    </div>
  );
}
