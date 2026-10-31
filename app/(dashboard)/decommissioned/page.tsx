import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getTranslations } from "next-intl/server";
import { ArchiveX } from "lucide-react";
import { DecommissionedTable } from "@/components/assets/decommissioned-table";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("decommissioned");
  return { title: t("title") };
}

export default async function DecommissionedPage() {
  const session = await auth();
  const userRole = session?.user?.role ?? "VIEWER";
  const t = await getTranslations("decommissioned");

  const assets = await prisma.asset.findMany({
    where: { status: "DECOMMISSIONED" },
    select: {
      id: true,
      locationId: true,
      model: { select: { name: true } },
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
      <PageHeader icon={ArchiveX} tone="neutral" title={t("title")} subtitle={t("subtitle", { count: assets.length })} />

      <DecommissionedTable assets={assets} userRole={userRole} />
    </div>
  );
}
