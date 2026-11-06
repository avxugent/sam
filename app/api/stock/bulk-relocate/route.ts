import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { auditChanges } from "@/lib/audit/diff";
import type { BulkFailure, BulkResult } from "@/lib/assets/bulk";
import { canEdit } from "@/lib/permissions";
import { invalidInput, isRecordNotFoundError, readJsonBody, unknownReferenceResponse } from "@/lib/route-helpers";
import { STATUS_CHANGED } from "@/lib/assets/transitions";
import { HISTORY_CHANGE_LABELS } from "@/lib/assets/history-keys";
import { idSchema } from "@/lib/schemas/ids";

const bulkRelocateSchema = z.object({
  ids: z.array(idSchema).min(1).max(200),
  locationId: idSchema.nullable(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await readJsonBody(req);
  const parsed = bulkRelocateSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInput(parsed.error);
  }
  const { ids, locationId } = parsed.data;

  const target = locationId
    ? await prisma.location.findUnique({ where: { id: locationId }, select: { name: true } })
    : null;
  if (locationId && !target) return unknownReferenceResponse("Location");

  const succeeded: string[] = [];
  const failed: BulkFailure[] = [];

  for (const id of ids) {
    const item = await prisma.stockItem.findUnique({
      where: { id },
      select: { lineageId: true, model: { select: { name: true } }, locationId: true, location: { select: { name: true } } },
    });
    if (!item) {
      failed.push({ id, reason: "NOT_FOUND" });
      continue;
    }
    // Guarded by the location just read, so the audit's "before" is the one replaced.
    try {
      await prisma.stockItem.update({ where: { id, locationId: item.locationId }, data: { locationId } });
    } catch (err) {
      if (!isRecordNotFoundError(err)) throw err;
      failed.push({ id, reason: STATUS_CHANGED });
      continue;
    }
    succeeded.push(id);

    // Same entry shape as other stock updates: location names for display,
    // and the lineage id so the move shows in the asset history.
    const changes = auditChanges([
      { label: HISTORY_CHANGE_LABELS.location, before: item.locationId, after: locationId, display: [item.location?.name, target?.name] },
    ]);
    await logAudit({
      session,
      req,
      action: "UPDATE",
      entityType: "StockItem",
      entityId: id,
      entityName: item.model?.name,
      detail: Object.keys(changes).length > 0 ? { changes } : undefined,
      lineageId: item.lineageId,
    });
  }

  return NextResponse.json<BulkResult>({ succeeded, failed });
}
