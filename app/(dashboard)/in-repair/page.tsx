import { prisma } from "@/lib/prisma";
import { getTranslations } from "next-intl/server";
import { Wrench } from "lucide-react";
import { InRepairTable } from "@/components/stock/in-repair-table";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("repair");
  return { title: `${t("title")} – SAM` };
}

export default async function InRepairPage() {
  const t = await getTranslations("repair");

  const assets = await prisma.asset.findMany({
    where: { status: "IN_REPAIR" },
    select: {
      id: true,
      locationId: true,
      model: true,
      serialNumber: true,
      repairStartedAt: true,
      repairNote: true,
      type: { select: { id: true, name: true } },
      manufacturer: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
    },
    orderBy: { repairStartedAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-[9px] bg-[#eff6ff] flex items-center justify-center flex-shrink-0">
          <Wrench className="h-4 w-4 text-[#1e40af]" />
        </div>
        <div>
          <h1 className="text-[22px] font-bold text-[#0f172a] tracking-[-0.01em]">{t("title")}</h1>
          <p className="text-[13px] text-[#64748b] mt-0.5">
            {t("subtitle", { count: assets.length })}
          </p>
        </div>
      </div>

      <InRepairTable assets={assets} />
    </div>
  );
}
