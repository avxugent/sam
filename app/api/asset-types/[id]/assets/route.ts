import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { assetListStatusFilter } from "@/lib/assets/list-status";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const statusFilter = assetListStatusFilter(new URL(req.url).searchParams.get("status"));

  const assets = await prisma.asset.findMany({
    where: { typeId: id, ...statusFilter },
    select: {
      id: true,
      model: { select: { name: true } },
      serialNumber: true,
      hostname: true,
      installationDate: true,
      location: { select: { id: true, name: true } },
      manufacturer: { select: { name: true } },
      macAddresses: { select: { id: true, address: true } },
    },
    orderBy: [{ location: { name: "asc" } }, { createdAt: "desc" }],
  });

  return NextResponse.json(assets);
}
