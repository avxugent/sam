import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { checkReturnToStock } from "@/lib/assets/lifecycle-rules";
import { RETURN_TO_STOCK_INCLUDE, lifecycleViolationResponse, returnAssetToStock, statusChangedResponse } from "@/lib/assets/transitions";
import { canEdit } from "@/lib/permissions";
import { invalidInput, notFoundResponse, readJsonBody, unknownReferenceResponse } from "@/lib/route-helpers";
import { idSchema } from "@/lib/schemas/ids";

const schema = z.object({
  locationId: idSchema,
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
  if (!location) return unknownReferenceResponse("Location");

  const { id } = await params;

  const found = await prisma.asset.findUnique({ where: { id }, include: RETURN_TO_STOCK_INCLUDE });
  if (!found) return notFoundResponse();
  const check = checkReturnToStock(found);
  if (check.violation) return lifecycleViolationResponse(check.violation);

  const stockItem = await returnAssetToStock(req, session, check.asset, locationId);
  return stockItem ? NextResponse.json({ stockItemId: stockItem.id }) : statusChangedResponse();
}
