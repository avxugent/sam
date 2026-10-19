import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SuppliersClient } from "@/components/settings/suppliers-client";

export default async function SuppliersPage() {
  const session = await auth();
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "MAINTAINER")) redirect("/");

  const t = await getTranslations("suppliers");

  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    // Decommissioned assets are historical, not current inventory — excluded
    // from the badge, same as the asset-types page.
    include: { _count: { select: { assets: { where: { status: "INSTALLED" } } } } },
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>
      <SuppliersClient initialSuppliers={suppliers} />
    </div>
  );
}

export const metadata = { title: "Suppliers – SAM Admin" };
