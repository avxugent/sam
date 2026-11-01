import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { assetListStatusFilter } from "@/lib/assets/list-status";
import { CATALOG_DRILLDOWN_SELECT } from "@/lib/assets/include";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Installed assets by default (what the page's badge counts), like the asset-type drilldown.
  const statusFilter = assetListStatusFilter(new URL(req.url).searchParams.get("status"));
  if ("error" in statusFilter) return statusFilter.error;

  const assets = await prisma.asset.findMany({
    where: { manufacturerId: id, ...statusFilter.where },
    select: CATALOG_DRILLDOWN_SELECT,
    orderBy: [{ location: { name: "asc" } }, { createdAt: "desc" }],
  });

  return NextResponse.json(assets);
}
