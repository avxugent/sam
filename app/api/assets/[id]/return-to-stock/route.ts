import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { assertReturnableToStock } from "@/lib/asset-lifecycle";
import { RETURN_TO_STOCK_INCLUDE, lifecycleViolationResponse, returnAssetToStock } from "@/lib/asset-transitions";
import { canEdit } from "@/lib/permissions";
import { invalidInput, readJsonBody } from "@/lib/route-helpers";

const schema = z.object({
  locationId: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await readJsonBody(req));
  if (!parsed.success) return invalidInput(parsed.error);
  const { locationId } = parsed.data;

  const location = await prisma.location.findUnique({ where: { id: locationId }, select: { id: true } });
  if (!location) return NextResponse.json({ error: "Location not found" }, { status: 400 });

  const { id } = await params;

  const asset = await prisma.asset.findUnique({ where: { id }, include: RETURN_TO_STOCK_INCLUDE });
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const violation = lifecycleViolationResponse(() => assertReturnableToStock(asset));
  if (violation) return violation;

  const stockItem = await returnAssetToStock(req, session, asset, locationId);
  return NextResponse.json({ stockItemId: stockItem.id });
}
