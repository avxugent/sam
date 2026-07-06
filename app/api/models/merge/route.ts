import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  canonical: z.string().min(1).max(255),
  variants: z.array(z.string().min(1).max(255)).min(1).max(50),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { canonical, variants } = parsed.data;
  const toMerge = variants.filter((v) => v !== canonical);
  if (toMerge.length === 0) {
    return NextResponse.json({ error: "No variants to merge." }, { status: 400 });
  }

  const movedCount = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    let total = 0;
    for (const variant of toMerge) {
      const result = await tx.asset.updateMany({ where: { model: variant }, data: { model: canonical } });
      total += result.count;
    }
    return total;
  });

  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "AssetModel",
    entityId: canonical,
    entityName: canonical,
    detail: { mergedVariants: toMerge, assetsMoved: movedCount },
  });

  return NextResponse.json({ ok: true, movedCount });
}
