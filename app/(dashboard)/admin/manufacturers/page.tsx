import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ManufacturersClient } from "@/components/settings/manufacturers-client";

export default async function ManufacturersPage() {
  const session = await auth();
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "MAINTAINER")) redirect("/");

  const manufacturers = await prisma.manufacturer.findMany({
    orderBy: { name: "asc" },
    // Decommissioned assets are historical, not current inventory — excluded
    // from the badge, same as the asset-types page.
    include: { _count: { select: { assets: { where: { status: "INSTALLED" } } } } },
  });

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Manufacturers</h1>
        <p className="text-muted-foreground mt-1">Manage the list of hardware manufacturers.</p>
      </div>
      <ManufacturersClient initialManufacturers={manufacturers} />
    </div>
  );
}

export const metadata = { title: "Manufacturers – SAM Admin" };
