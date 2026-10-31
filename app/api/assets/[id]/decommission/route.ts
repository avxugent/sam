import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { decommissionViolation } from "@/lib/assets/lifecycle-rules";
import { DECOMMISSION_SELECT, decommissionAsset, decommissionFields, lifecycleViolationResponse, statusChangedResponse } from "@/lib/assets/transitions";
import { canEdit } from "@/lib/permissions";
import { invalidInput, notFoundResponse, readJsonBody } from "@/lib/route-helpers";

const schema = z.object(decommissionFields);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const existing = await prisma.asset.findUnique({ where: { id }, select: DECOMMISSION_SELECT });
  if (!existing) return notFoundResponse();
  const violation = lifecycleViolationResponse(decommissionViolation(existing));
  if (violation) return violation;

  const parsed = schema.safeParse(await readJsonBody(req));
  if (!parsed.success) return invalidInput(parsed.error);

  const asset = await decommissionAsset(req, session, id, existing, parsed.data);
  return asset ? NextResponse.json(asset) : statusChangedResponse();
}
