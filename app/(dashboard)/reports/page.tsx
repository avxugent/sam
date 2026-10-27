import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ReportsListClient } from "@/components/reports/ReportsListClient";
import { BarChart2 } from "lucide-react";
import { canEdit, isAdmin } from "@/lib/permissions";

export const metadata = { title: "Reports – SAM" };

export default async function ReportsPage() {
  const session = await auth();

  const reports = await prisma.report.findMany({
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, description: true, createdAt: true, updatedAt: true },
  });


  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-[9px] bg-[#e8f0fc] flex items-center justify-center flex-shrink-0">
          <BarChart2 className="h-4 w-4 text-[#1e64c8]" />
        </div>
        <div>
          <h1 className="text-[22px] font-bold text-[#0f172a] tracking-[-0.01em]">Reports</h1>
          <p className="text-[13px] text-[#64748b] mt-0.5">
            {reports.length} saved report{reports.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <ReportsListClient reports={reports} canEdit={canEdit(session?.user?.role)} isAdmin={isAdmin(session?.user?.role)} />
    </div>
  );
}
