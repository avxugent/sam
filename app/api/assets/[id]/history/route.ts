import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { notFoundResponse } from "@/lib/route-helpers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const asset = await prisma.asset.findUnique({ where: { id }, select: { lineageId: true } });
  if (!asset) return notFoundResponse("Asset");

  const entries = await prisma.auditLog.findMany({
    where: { lineageId: asset.lineageId },
    orderBy: { timestamp: "desc" },
  });

  return NextResponse.json(entries);
}
