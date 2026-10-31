import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { auditChanges } from "@/lib/audit/diff";
import type { BulkFailure, BulkResult } from "@/lib/bulk";
import { canEdit } from "@/lib/permissions";
import { invalidInput, readJsonBody, unknownReferenceResponse } from "@/lib/route-helpers";

const bulkRelocateSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  locationId: z.string().min(1).nullable(),
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

  const existing = await prisma.stockItem.findMany({
    where: { id: { in: ids } },
    select: { id: true, lineageId: true, model: { select: { name: true } }, locationId: true, location: { select: { name: true } } },
  });
  const existingIds = new Set(existing.map((e) => e.id));
  const failed = ids
    .filter((id) => !existingIds.has(id))
    .map((id): BulkFailure => ({ id, reason: "NOT_FOUND" }));

  if (existing.length > 0) {
    await prisma.stockItem.updateMany({
      where: { id: { in: existing.map((e) => e.id) } },
      data: { locationId },
    });

    // Same entry shape as other stock updates: location names for display,
    // and the lineage id so the move shows in the asset history.
    await Promise.all(
      existing.map((item) => {
        const changes = auditChanges([
          { label: "Location", before: item.locationId, after: locationId, display: [item.location?.name, target?.name] },
        ]);
        return logAudit({
          session,
          req,
          action: "UPDATE",
          entityType: "StockItem",
          entityId: item.id,
          entityName: item.model?.name,
          detail: Object.keys(changes).length > 0 ? { changes } : undefined,
          lineageId: item.lineageId,
        });
      })
    );
  }

  return NextResponse.json<BulkResult>({ succeeded: existing.map((e) => e.id), failed });
}
