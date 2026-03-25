import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AssetTypesClient } from "@/components/settings/asset-types-client";

export default async function AssetTypesPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/");

  const types = await prisma.assetType.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { assets: true } } },
  });

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Asset Types</h1>
        <p className="text-muted-foreground mt-1">
          Manage the list of asset types (e.g. Projector, Monitor, PC).
        </p>
      </div>
      <AssetTypesClient initialTypes={types} />
    </div>
  );
}

export const metadata = { title: "Asset Types – SAM Admin" };
