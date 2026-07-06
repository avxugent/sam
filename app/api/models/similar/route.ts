import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { findSimilarModel } from "@/lib/model-similarity";

const querySchema = z.object({
  q: z.string().min(1).max(255),
  excludeAssetId: z.string().max(50).optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    excludeAssetId: searchParams.get("excludeAssetId") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { q, excludeAssetId } = parsed.data;

  let excludeModel: string | null = null;
  if (excludeAssetId) {
    const asset = await prisma.asset.findUnique({
      where: { id: excludeAssetId },
      select: { model: true },
    });
    excludeModel = asset?.model ?? null;
  }

  const rows = await prisma.asset.findMany({
    where: { model: { not: null } },
    select: { model: true },
    distinct: ["model"],
    take: 5000,
  });

  const existingModels = rows
    .map((r) => r.model as string)
    .filter((m) => m !== excludeModel);

  const match = findSimilarModel(q, existingModels);
  return NextResponse.json({ match });
}
