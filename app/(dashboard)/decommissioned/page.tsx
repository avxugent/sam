import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { ArchiveX } from "lucide-react";
import { DecommissionedTable } from "@/components/stock/decommissioned-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Decommissioned – SAM" };

export default async function DecommissionedPage() {
  const session = await auth();
  const userRole = session?.user?.role ?? "VIEWER";

  const assets = await prisma.asset.findMany({
    where: { status: "DECOMMISSIONED" },
    select: {
      id: true,
      locationId: true,
      model: true,
      serialNumber: true,
      decommissionedAt: true,
      decommissionNote: true,
      lastLocationName: true,
      lastLocationFiNumber: true,
      type: { select: { id: true, name: true } },
      manufacturer: { select: { id: true, name: true } },
    },
    orderBy: { decommissionedAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-[9px] bg-[#f1f5f9] flex items-center justify-center flex-shrink-0">
          <ArchiveX className="h-4 w-4 text-[#64748b]" />
        </div>
        <div>
          <h1 className="text-[22px] font-bold text-[#0f172a] tracking-[-0.01em]">Decommissioned</h1>
          <p className="text-[13px] text-[#64748b] mt-0.5">
            {assets.length} asset{assets.length !== 1 ? "s" : ""} retired from service
          </p>
        </div>
      </div>

      <DecommissionedTable assets={assets} userRole={userRole} />
    </div>
  );
}
