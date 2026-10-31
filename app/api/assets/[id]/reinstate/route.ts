import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { reinstateViolation } from "@/lib/assets/lifecycle-rules";
import { REPAIR_SELECT, lifecycleViolationResponse, reinstateAsset, statusChangedResponse } from "@/lib/assets/transitions";
import { notFoundResponse } from "@/lib/route-helpers";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.asset.findUnique({ where: { id }, select: REPAIR_SELECT });
  if (!existing) return notFoundResponse();
  const violation = lifecycleViolationResponse(reinstateViolation(existing));
  if (violation) return violation;

  const asset = await reinstateAsset(req, session, id, existing);
  if (!asset) return statusChangedResponse();

  return NextResponse.json(asset);
}
