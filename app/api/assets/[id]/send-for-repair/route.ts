import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { assertRepairable, buildSendForRepairUpdateData } from "@/lib/assets/lifecycle-rules";
import { lifecycleViolationResponse } from "@/lib/assets/transitions";
import { canEdit } from "@/lib/permissions";
import { invalidInput, readJsonBody } from "@/lib/route-helpers";

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
  const existing = await prisma.asset.findUnique({
    where: { id },
    select: { model: { select: { name: true } }, status: true, lineageId: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const violation = lifecycleViolationResponse(() => assertRepairable(existing));
  if (violation) return violation;

  // The note is optional, so an empty or missing body is fine.
  const parsed = schema.safeParse((await readJsonBody(req)) ?? {});
  if (!parsed.success) {
    return invalidInput(parsed.error);
  }

  const asset = await prisma.asset.update({
    where: { id },
    data: buildSendForRepairUpdateData({
      note: parsed.data.note ?? null,
      actorId: session.user.id,
    }),
  });

  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "Asset",
    entityId: id,
    entityName: existing.model?.name ?? undefined,
    detail: { status: "IN_REPAIR", note: parsed.data.note },
    lineageId: existing.lineageId,
  });

  return NextResponse.json(asset);
}
