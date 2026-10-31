import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ReportsListClient } from "@/components/reports/reports-list-client";
import { BarChart2 } from "lucide-react";
import { canEdit, isAdmin } from "@/lib/permissions";
import { PageHeader } from "@/components/layout/page-header";

export async function generateMetadata() {
  const t = await getTranslations("report");
  return { title: t("title") };
}

export default async function ReportsPage() {
  const session = await auth();
  const t = await getTranslations("report");

  const reports = await prisma.report.findMany({
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, description: true, createdAt: true, updatedAt: true },
  });


  return (
    <div className="space-y-6">
      <PageHeader
        icon={BarChart2}
        title={t("title")}
        subtitle={t("savedCount", { count: reports.length })}
      />

      <ReportsListClient reports={reports} canEdit={canEdit(session?.user?.role)} isAdmin={isAdmin(session?.user?.role)} />
    </div>
  );
}
