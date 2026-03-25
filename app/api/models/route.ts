import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";

  const models = await prisma.asset.findMany({
    where: q ? { model: { contains: q } } : { model: { not: null } },
    select: { model: true },
    distinct: ["model"],
    orderBy: { model: "asc" },
    take: 20,
  });

  return NextResponse.json(models.map((m: { model: string | null }) => m.model).filter(Boolean));
}
