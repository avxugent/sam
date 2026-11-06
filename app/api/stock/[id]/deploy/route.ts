import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { canEdit } from "@/lib/permissions";
import { invalidInput, isUniqueConstraintError, notFoundResponse, readJsonBody, unknownReferenceResponse } from "@/lib/route-helpers";
import { DEPLOY_INCLUDE, deployStockItem, lifecycleViolationResponse, stockChangedResponse } from "@/lib/assets/transitions";
import { deployViolation } from "@/lib/assets/lifecycle-rules";
import { hostnameTakenResponse } from "@/lib/assets/input";
import { MAX_ID_LENGTH } from "@/lib/schemas/ids";

const deploySchema = z
  .object({
    locationId: z.string().min(1, "Location is required").max(MAX_ID_LENGTH),
    quantity: z.number().int().min(1),
    serialNumbers: z.array(z.string().max(100)).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.serialNumbers !== undefined && data.serialNumbers.length !== data.quantity) {
      ctx.addIssue({
        code: "custom",
        path: ["serialNumbers"],
        message: "serialNumbers length must equal quantity.",
      });
    }
  });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await readJsonBody(req);
  const parsed = deploySchema.safeParse(body);
  if (!parsed.success) {
    return invalidInput(parsed.error);
  }

  const { locationId, quantity, serialNumbers } = parsed.data;

  const location = await prisma.location.findUnique({ where: { id: locationId } });
  if (!location) return unknownReferenceResponse("The location");

  const stockItem = await prisma.stockItem.findUnique({ where: { id }, include: DEPLOY_INCLUDE });
  if (!stockItem) return notFoundResponse("Stock item");

  const violation = lifecycleViolationResponse(deployViolation(stockItem, quantity));
  if (violation) return violation;

  let createdAssets;
  try {
    createdAssets = await deployStockItem(req, session, stockItem, { location, quantity, serialNumbers });
  } catch (err: unknown) {
    // hostname is the only unique Asset column a deployed copy can collide on
    if (isUniqueConstraintError(err)) return hostnameTakenResponse();
    throw err;
  }
  if (!createdAssets) return stockChangedResponse();

  return NextResponse.json({ assetIds: createdAssets.map((a) => a.id), locationId });
}
