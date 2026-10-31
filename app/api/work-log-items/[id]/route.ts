import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { updateWorkLogItemSchema } from "@/lib/schemas/work-log-item";
import { isAdmin } from "@/lib/permissions";
import { invalidInput, isUniqueConstraintError, nameTakenResponse, notFoundResponse, readJsonBody } from "@/lib/route-helpers";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await readJsonBody(req);
  const parsed = updateWorkLogItemSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInput(parsed.error);
  }

  const current = await prisma.workLogItem.findUnique({ where: { id }, select: { name: true } });
  if (!current) return notFoundResponse("Work log item");

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
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return nameTakenResponse();
    }
    throw err;
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const item = await prisma.workLogItem.findUnique({ where: { id }, select: { name: true } });
  if (!item) return notFoundResponse("Work log item");

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
