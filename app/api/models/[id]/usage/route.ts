import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [assets, stockItems] = await Promise.all([
    prisma.asset.findMany({
      // Decommissioned assets are historical, not current inventory — excluded
      // from the drilldown, same as the badge count on the models page.
      where: { modelId: id, status: "INSTALLED" },
      select: {
        id: true,
        serialNumber: true,
        hostname: true,
        status: true,
        location: { select: { id: true, name: true } },
      },
      orderBy: [{ location: { name: "asc" } }, { createdAt: "desc" }],
    }),
    prisma.stockItem.findMany({
      where: { modelId: id },
      select: {
        id: true,
        serialNumber: true,
        quantity: true,
        location: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({ assets, stockItems });
}
