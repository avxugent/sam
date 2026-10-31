import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ManufacturersClient } from "@/components/admin/manufacturers-client";
import { canManageCatalog } from "@/lib/permissions";

export default async function ManufacturersPage() {
  const session = await auth();
  if (!session?.user || !canManageCatalog(session.user.role)) redirect("/");

  const t = await getTranslations("adminPages");

  const manufacturers = await prisma.manufacturer.findMany({
    orderBy: { name: "asc" },
    // Decommissioned assets are historical, not current inventory — excluded
    // from the badge, same as the asset-types page.
    include: { _count: { select: { assets: { where: { status: "INSTALLED" } } } } },
  });

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t("manufacturers.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("manufacturers.subtitle")}</p>
      </div>
      <ManufacturersClient initialManufacturers={manufacturers} />
    </div>
  );
}

export const metadata = { title: "Manufacturers" };
