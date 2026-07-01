import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Active assets only by default. `?status=DECOMMISSIONED` lists decommissioned
  // ones; `?status=all` lists both. (Returned-to-stock assets are deleted, not
  // decommissioned, so they never appear here.)
  const statusParam = new URL(req.url).searchParams.get("status");
  const statusFilter =
    statusParam === "all"
      ? {}
      : statusParam === "DECOMMISSIONED"
        ? { status: "DECOMMISSIONED" as const }
        : { status: "INSTALLED" as const };

  const assets = await prisma.asset.findMany({
    where: { typeId: id, ...statusFilter },
    select: {
      id: true,
      model: true,
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
