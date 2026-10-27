import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { AssetLifecycleError, assertDecommissionable, buildDecommissionUpdateData } from "@/lib/asset-lifecycle";
import { canEdit } from "@/lib/permissions";
import { invalidInput } from "@/lib/route-helpers";

const schema = z.object({
  note: z.string().max(500).optional().nullable(),
  // Required disposal evidence (NIS2): how the device left the inventory.
  disposalMethod: z.enum(["WIPED", "DESTROYED", "RETURNED", "RESOLD", "OTHER"]),
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
    select: {
      model: { select: { name: true } },
      status: true,
      lineageId: true,
      location: { select: { name: true, fiNumber: true } },
    },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    assertDecommissionable(existing);
  } catch (err) {
    if (err instanceof AssetLifecycleError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return invalidInput(parsed.error);
  }

  const asset = await prisma.asset.update({
    where: { id },
    data: buildDecommissionUpdateData({
      note: parsed.data.note ?? null,
      disposalMethod: parsed.data.disposalMethod,
      actorId: session.user.id,
      location: existing.location,
    }),
  });

  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "Asset",
    entityId: id,
    entityName: existing.model?.name ?? undefined,
    detail: {
      status: "DECOMMISSIONED",
      note: parsed.data.note,
      disposalMethod: parsed.data.disposalMethod,
      lastLocation: existing.location.name,
    },
    lineageId: existing.lineageId,
  });

  return NextResponse.json(asset);
}
