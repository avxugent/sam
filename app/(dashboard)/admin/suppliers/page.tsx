import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SuppliersClient } from "@/components/admin/catalog/suppliers-client";
import { canManageCatalog } from "@/lib/permissions";

export default async function SuppliersPage() {
  const session = await auth();
  if (!session?.user || !canManageCatalog(session.user.role)) redirect("/");

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
      <SuppliersClient
        initialSuppliers={suppliers.map((s) => ({
          ...s,
          defaultFrom: s.defaultFrom?.toISOString() ?? null,
          defaultUntil: s.defaultUntil?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}

export async function generateMetadata() {
  const t = await getTranslations("suppliers");
  return { title: t("title") };
}
