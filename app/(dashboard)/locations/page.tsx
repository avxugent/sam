import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { AssetTable } from "@/components/assets/asset-table";
import { Layers } from "lucide-react";

export default async function AllLocationsPage() {
  const session = await auth();

  const templateSettings = await prisma.appSetting.findMany({
    where: { key: { in: ["hostname.urlTemplate", "macAddress.urlTemplate"] } },
  });
  const templateMap = Object.fromEntries(templateSettings.map((s) => [s.key, s.value]));
  const hostnameUrlTemplate = templateMap["hostname.urlTemplate"] || null;
  const macAddressUrlTemplate = templateMap["macAddress.urlTemplate"] || null;

  const assets = await prisma.asset.findMany({
    include: {
      type: true,
      manufacturer: true,
      macAddresses: true,
      location: { select: { id: true, name: true } },
      _count: { select: { attachments: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const totalCount = await prisma.location.count();

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-[9px] bg-[#e8f0fc] flex items-center justify-center flex-shrink-0">
          <Layers className="h-4 w-4 text-[#1e64c8]" />
        </div>
        <div>
          <h1 className="text-[22px] font-bold text-[#0f172a] tracking-[-0.01em]">All locations</h1>
          <p className="text-[13px] text-[#64748b] mt-0.5">
            {assets.length} asset{assets.length !== 1 ? "s" : ""} across {totalCount} location{totalCount !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <AssetTable
        assets={assets}
        locationId=""
        userRole={session?.user?.role || "VIEWER"}
        showLocation={true}
        hostnameUrlTemplate={hostnameUrlTemplate}
        macAddressUrlTemplate={macAddressUrlTemplate}
      />
    </div>
  );
}

export const metadata = { title: "All Locations – SAM" };
