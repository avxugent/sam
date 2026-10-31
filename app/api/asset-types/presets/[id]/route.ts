import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { updatePresetSchema } from "@/lib/schemas/work-log";
import { isAdmin } from "@/lib/permissions";
import { invalidInput, notFoundResponse, readJsonBody } from "@/lib/route-helpers";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.maintenancePreset.findUnique({ where: { id } });
  if (!existing) return notFoundResponse();

  const body = await readJsonBody(req);
  const parsed = updatePresetSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInput(parsed.error);
  }

  const updated = await prisma.maintenancePreset.update({
    where: { id },
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
    },
  });

  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "MaintenancePreset",
    entityId: id,
    entityName: updated.name,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.maintenancePreset.findUnique({ where: { id } });
  if (!existing) return notFoundResponse();

  await prisma.maintenancePreset.delete({ where: { id } });
  await logAudit({
    session,
    req,
    action: "DELETE",
    entityType: "MaintenancePreset",
    entityId: id,
    entityName: existing.name,
  });

  return NextResponse.json({ ok: true });
}
