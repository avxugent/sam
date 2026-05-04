import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  note: z.string().max(500).optional().nullable(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.asset.findUnique({ where: { id }, select: { model: true, status: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.status === "DECOMMISSIONED") {
    return NextResponse.json({ error: "Asset is already decommissioned." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const asset = await prisma.asset.update({
    where: { id },
    data: {
      status: "DECOMMISSIONED",
      decommissionedAt: new Date(),
      decommissionNote: parsed.data.note ?? null,
    },
  });

  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "Asset",
    entityId: id,
    entityName: existing.model ?? undefined,
    detail: { status: "DECOMMISSIONED", note: parsed.data.note },
  });

  return NextResponse.json(asset);
}
