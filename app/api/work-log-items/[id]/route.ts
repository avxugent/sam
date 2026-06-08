import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { updateWorkLogItemSchema } from "@/lib/work-log-item-schema";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateWorkLogItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const current = await prisma.workLogItem.findUnique({ where: { id }, select: { name: true } });
  if (!current) return NextResponse.json({ error: "Work log item not found." }, { status: 404 });

  try {
    const item = await prisma.workLogItem.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description ?? null } : {}),
      },
    });
    await logAudit({
      session,
      req,
      action: "UPDATE",
      entityType: "WorkLogItem",
      entityId: id,
      entityName: item.name,
      detail: current.name !== item.name
        ? { changes: { Name: { from: current.name, to: item.name } } }
        : undefined,
    });
    return NextResponse.json(item);
  } catch {
    return NextResponse.json({ error: "Name already exists." }, { status: 409 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const item = await prisma.workLogItem.findUnique({ where: { id }, select: { name: true } });
  if (!item) return NextResponse.json({ error: "Work log item not found." }, { status: 404 });

  // onDelete: SetNull clears itemId on any work logs that referenced this item.
  await prisma.workLogItem.delete({ where: { id } });
  await logAudit({
    session,
    req,
    action: "DELETE",
    entityType: "WorkLogItem",
    entityId: id,
    entityName: item.name,
  });
  return NextResponse.json({ ok: true });
}
