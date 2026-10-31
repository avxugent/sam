import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { repairViolation } from "@/lib/assets/lifecycle-rules";
import { REPAIR_SELECT, lifecycleViolationResponse, sendAssetForRepair, statusChangedResponse } from "@/lib/assets/transitions";
import { canEdit } from "@/lib/permissions";
import { invalidInput, notFoundResponse, readJsonBody } from "@/lib/route-helpers";

const schema = z.object({
  note: z.string().max(500).optional().nullable(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.asset.findUnique({ where: { id }, select: REPAIR_SELECT });
  if (!existing) return notFoundResponse();
  const violation = lifecycleViolationResponse(repairViolation(existing));
  if (violation) return violation;

  // The note is optional, so an empty or missing body is fine.
  const parsed = schema.safeParse((await readJsonBody(req)) ?? {});
  if (!parsed.success) {
    return invalidInput(parsed.error);
  }

  const asset = await sendAssetForRepair(req, session, id, existing, { note: parsed.data.note });
  if (!asset) return statusChangedResponse();

  return NextResponse.json(asset);
}
