import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { isAdmin } from "@/lib/permissions";
import { buildReinstateUpdateData, reinstateViolation } from "@/lib/assets/lifecycle-rules";
import { lifecycleViolationResponse } from "@/lib/assets/transitions";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.asset.findUnique({
    where: { id },
    select: { model: { select: { name: true } }, status: true, lineageId: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const violation = lifecycleViolationResponse(reinstateViolation(existing));
  if (violation) return violation;

  const asset = await prisma.asset.update({ where: { id }, data: buildReinstateUpdateData() });

  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "Asset",
    entityId: id,
    entityName: existing.model?.name ?? undefined,
    detail: { status: "INSTALLED" },
    lineageId: existing.lineageId,
  });

  return NextResponse.json(asset);
}
