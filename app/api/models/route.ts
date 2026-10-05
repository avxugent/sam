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

  const [assets, stockItems] = await Promise.all([
    prisma.asset.findMany({
      where: {
        model: q ? { contains: q } : { not: null },
        ...(typeId ? { typeId } : {}),
        ...(manufacturerId ? { manufacturerId } : {}),
      },
      select: { model: true, typeId: true, manufacturerId: true },
      orderBy: { model: "asc" },
      take: 200,
    }),
    prisma.stockItem.findMany({
      where: {
        model: q ? { contains: q } : undefined,
        ...(typeId ? { typeId } : {}),
        ...(manufacturerId ? { manufacturerId } : {}),
      },
      select: { model: true, typeId: true, manufacturerId: true },
      orderBy: { model: "asc" },
      take: 200,
    }),
  ]);

  // Deduplicate by normalized model name (case/punctuation-insensitive) across
  // assets and stock. Assets are listed first, so their spelling wins on a clash.
  const seen = new Set<string>();
  const unique: { model: string; typeId: string | null; manufacturerId: string | null }[] = [];
  for (const row of [...assets, ...stockItems]) {
    if (!row.model) continue;
    const key = normalizeModelName(row.model);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ model: row.model, typeId: row.typeId, manufacturerId: row.manufacturerId });
  }

  // Merged from two alphabetically sorted sources, so re-sort before capping.
  unique.sort((a, b) => a.model.localeCompare(b.model));

  return NextResponse.json(unique.slice(0, 20));
}
