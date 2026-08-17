import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { resolveLocationPathsBatch } from "@/lib/location-path";
import { ReportBuilder } from "@/components/reports/ReportBuilder";
import { BarChart2 } from "lucide-react";

export const metadata = { title: "New Report – SAM" };

export default async function NewReportPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "VIEWER") redirect("/reports");

  const [assetTypes, manufacturers, locations, workLogItems, suppliers] = await Promise.all([
    prisma.assetType.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.manufacturer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.location.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.workLogItem.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const locationPaths = await resolveLocationPathsBatch(locations.map((l) => l.id), " › ");
  const locationScopeOptions = locations.map((l) => ({ id: l.id, name: locationPaths.get(l.id) ?? l.name }));

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-[9px] bg-[#e8f0fc] flex items-center justify-center flex-shrink-0">
          <BarChart2 className="h-4 w-4 text-[#1e64c8]" />
        </div>
        <div>
          <h1 className="text-[22px] font-bold text-[#0f172a] tracking-[-0.01em]">New Report</h1>
          <p className="text-[13px] text-[#64748b] mt-0.5">Define filters, grouping, and columns</p>
        </div>
      </div>

      <ReportBuilder
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
