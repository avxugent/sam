import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { AssetLifecycleError, assertDecommissionable, buildDecommissionUpdateData } from "@/lib/asset-lifecycle";

const schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  note: z.string().max(500).optional().nullable(),
  disposalMethod: z.enum(["WIPED", "DESTROYED", "RETURNED", "RESOLD", "OTHER"]),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { ids, note, disposalMethod } = parsed.data;

  const succeeded: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const id of ids) {
    const existing = await prisma.asset.findUnique({
      where: { id },
      select: { model: { select: { name: true } }, status: true, lineageId: true, location: { select: { name: true, fiNumber: true } } },
    });
    if (!existing) {
      failed.push({ id, reason: "NOT_FOUND" });
      continue;
    }
    try {
      assertDecommissionable(existing);
    } catch (err) {
      if (err instanceof AssetLifecycleError) {
        failed.push({ id, reason: err.code });
        continue;
      }
      throw err;
    }

    await prisma.asset.update({
      where: { id },
      data: buildDecommissionUpdateData({
        note: note ?? null,
        disposalMethod,
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
        note,
        disposalMethod,
        lastLocation: existing.location.name,
      },
      lineageId: existing.lineageId,
    });

    succeeded.push(id);
  }

  return NextResponse.json({ succeeded, failed });
}
