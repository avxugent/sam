import { prisma } from "@/lib/prisma";
import { getTranslations } from "next-intl/server";
import { Wrench } from "lucide-react";
import { InRepairTable } from "@/components/assets/in-repair-table";
import { PageHeader } from "@/components/layout/page-header";

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
      model: { select: { name: true } },
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
      <PageHeader icon={Wrench} tone="info" title={t("title")} subtitle={t("subtitle", { count: assets.length })} />

      <InRepairTable assets={assets} />
    </div>
  );
}
