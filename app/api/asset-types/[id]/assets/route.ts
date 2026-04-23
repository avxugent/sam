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

  const assets = await prisma.asset.findMany({
    where: { typeId: id },
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
