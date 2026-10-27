import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { assertReturnableToStock } from "@/lib/asset-lifecycle";
import { RETURN_TO_STOCK_INCLUDE, lifecycleViolationCode, returnAssetToStock } from "@/lib/asset-transitions";
import { canEdit } from "@/lib/permissions";
import { invalidInput, readJsonBody } from "@/lib/route-helpers";

const schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  locationId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await readJsonBody(req));
  if (!parsed.success) return invalidInput(parsed.error);
  const { ids, locationId } = parsed.data;

  const location = await prisma.location.findUnique({ where: { id: locationId }, select: { id: true } });
  if (!location) return NextResponse.json({ error: "Location not found" }, { status: 400 });

  const succeeded: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const id of ids) {
    const asset = await prisma.asset.findUnique({ where: { id }, include: RETURN_TO_STOCK_INCLUDE });
    const reason = asset ? lifecycleViolationCode(() => assertReturnableToStock(asset)) : "NOT_FOUND";
    if (!asset || reason) {
      failed.push({ id, reason: reason ?? "NOT_FOUND" });
      continue;
    }
    await returnAssetToStock(req, session, asset, locationId);
    succeeded.push(id);
  }

  return NextResponse.json({ succeeded, failed });
}
