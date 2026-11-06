import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateReportSchema } from "@/lib/schemas/report";
import { logAudit } from "@/lib/audit";
import { canEdit, isAdmin } from "@/lib/permissions";
import { invalidInput, isRecordNotFoundError, notFoundResponse, readJsonBody } from "@/lib/route-helpers";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const report = await prisma.report.findUnique({ where: { id } });
  if (!report) return notFoundResponse("Report");

  return NextResponse.json(report);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const report = await prisma.report.findUnique({ where: { id } });
  if (!report) return notFoundResponse("Report");

  const body = await readJsonBody(req);
  const parsed = updateReportSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInput(parsed.error);
  }

  const { name, description, definition } = parsed.data;
  let updated;
  try {
    updated = await prisma.report.update({
      where: { id },
      data: {
        name,
        description,
        definition: definition && JSON.stringify(definition),
      },
    });
  } catch (err) {
    // Deleted by a concurrent request since the read.
    if (isRecordNotFoundError(err)) return notFoundResponse("Report");
    throw err;
  }

  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "Report",
    entityId: updated.id,
    entityName: updated.name,
    detail: name !== undefined && name !== report.name
      ? { changes: { "Name": { from: report.name, to: updated.name } } }
      : undefined,
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const report = await prisma.report.findUnique({ where: { id } });
  if (!report) return notFoundResponse("Report");

  try {
    await prisma.report.delete({ where: { id } });
  } catch (err) {
    // Deleted by a concurrent request since the read.
    if (isRecordNotFoundError(err)) return notFoundResponse("Report");
    throw err;
  }

  await logAudit({
    session,
    req,
    action: "DELETE",
    entityType: "Report",
    entityId: id,
    entityName: report.name,
  });

  return NextResponse.json({ ok: true });
}
