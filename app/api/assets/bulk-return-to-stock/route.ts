import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { checkReturnToStock } from "@/lib/assets/lifecycle-rules";
import { RETURN_TO_STOCK_INCLUDE, STATUS_CHANGED, returnAssetToStock } from "@/lib/assets/transitions";
import { canEdit } from "@/lib/permissions";
import { invalidInput, readJsonBody, unknownReferenceResponse } from "@/lib/route-helpers";
import type { BulkFailure, BulkResult } from "@/lib/bulk";

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
  if (!location) return unknownReferenceResponse("Location");

  const succeeded: string[] = [];
  const failed: BulkFailure[] = [];

  for (const id of ids) {
    const found = await prisma.asset.findUnique({ where: { id }, include: RETURN_TO_STOCK_INCLUDE });
    if (!found) {
      failed.push({ id, reason: "NOT_FOUND" });
      continue;
    }
    const check = checkReturnToStock(found);
    if (check.violation) {
      failed.push({ id, reason: check.violation.code });
      continue;
    }
    if (!(await returnAssetToStock(req, session, check.asset, locationId))) {
      failed.push({ id, reason: STATUS_CHANGED });
      continue;
    }
    succeeded.push(id);
  }

  return NextResponse.json<BulkResult>({ succeeded, failed });
}
