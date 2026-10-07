import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { logAudit } from "@/lib/audit";

const bulkRelocateSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  locationId: z.string().min(1).nullable(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = bulkRelocateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { ids, locationId } = parsed.data;

  if (locationId) {
    const location = await prisma.location.findUnique({ where: { id: locationId }, select: { id: true } });
    if (!location) return NextResponse.json({ error: "Location not found" }, { status: 400 });
  }

  const existing = await prisma.stockItem.findMany({
    where: { id: { in: ids } },
    select: { id: true, model: { select: { name: true } }, locationId: true },
  });
  const existingIds = new Set(existing.map((e) => e.id));
  const failed = ids
    .filter((id) => !existingIds.has(id))
    .map((id) => ({ id, reason: "NOT_FOUND" }));

  if (existing.length > 0) {
    await prisma.stockItem.updateMany({
      where: { id: { in: existing.map((e) => e.id) } },
      data: { locationId },
    });

    await Promise.all(
      existing.map((item) =>
        logAudit({
          session,
          req,
          action: "UPDATE",
          entityType: "StockItem",
          entityId: item.id,
          entityName: item.model?.name,
          detail: { changes: { Location: { from: item.locationId, to: locationId } } },
        })
      )
    );
  }

  return NextResponse.json({ succeeded: existing.map((e) => e.id), failed });
}
