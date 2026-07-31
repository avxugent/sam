import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  approvedVersion: z.string().min(1).max(100).optional(),
  model: z.string().max(255).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const existing = await prisma.firmwareBaseline.findUnique({
    where: { id },
    include: { type: { select: { name: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only apply the fields that were actually sent, so a partial update cannot
  // silently blank the version or the model.
  const data: { approvedVersion?: string; model?: string | null; notes?: string | null } = {};
  if (parsed.data.approvedVersion !== undefined) {
    data.approvedVersion = parsed.data.approvedVersion.trim();
  }
  if (parsed.data.model !== undefined) {
    const trimmed = parsed.data.model?.trim();
    data.model = trimmed ? trimmed : null;
  }
  if (parsed.data.notes !== undefined) data.notes = parsed.data.notes || null;

  try {
    const baseline = await prisma.firmwareBaseline.update({
      where: { id },
      data,
      include: { type: { select: { id: true, name: true } } },
    });
    await logAudit({
      session,
      req,
      action: "UPDATE",
      entityType: "FirmwareBaseline",
      entityId: baseline.id,
      entityName: `${baseline.type.name} / ${baseline.model ?? "all models"}`,
      detail: {
        approvedVersion: `${existing.approvedVersion} → ${baseline.approvedVersion}`,
      },
    });
    return NextResponse.json(baseline);
  } catch {
    return NextResponse.json(
      { error: "A baseline already exists for this asset type and model." },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.firmwareBaseline.findUnique({
    where: { id },
    include: { type: { select: { name: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.firmwareBaseline.delete({ where: { id } });
  await logAudit({
    session,
    req,
    action: "DELETE",
    entityType: "FirmwareBaseline",
    entityId: id,
    // Removing a baseline moves every matching asset back to *unclassified*,
    // so this is a compliance-visible change worth an audit trail.
    entityName: `${existing.type.name} / ${existing.model ?? "all models"}`,
    detail: { approvedVersion: existing.approvedVersion },
  });

  return NextResponse.json({ ok: true });
}
