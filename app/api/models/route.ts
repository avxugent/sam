import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { normalizeModelName } from "@/lib/model-similarity";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const typeId = searchParams.get("typeId") || undefined;
  const manufacturerId = searchParams.get("manufacturerId") || undefined;

  const assets = await prisma.asset.findMany({
    where: {
      model: q ? { contains: q } : { not: null },
      ...(typeId ? { typeId } : {}),
      ...(manufacturerId ? { manufacturerId } : {}),
    },
    select: { model: true, typeId: true, manufacturerId: true },
    orderBy: { model: "asc" },
    take: 200,
  });

  // Deduplicate by normalized model name (case/punctuation-insensitive), keep first occurrence
  const seen = new Set<string>();
  const result: { model: string; typeId: string | null; manufacturerId: string | null }[] = [];
  for (const a of assets) {
    if (!a.model) continue;
    const key = normalizeModelName(a.model);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ model: a.model, typeId: a.typeId, manufacturerId: a.manufacturerId });
    if (result.length >= 20) break;
  }

  return NextResponse.json(result);
}
