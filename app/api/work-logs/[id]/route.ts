import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { auditChanges } from "@/lib/audit/diff";
import { updateWorkLogSchema } from "@/lib/schemas/work-log";
import { WORK_LOG_INCLUDE } from "@/lib/work-logs/include";
import { isAdmin } from "@/lib/permissions";
import { invalidInput, readJsonBody } from "@/lib/route-helpers";
import { toIsoDay } from "@/lib/utils";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const log = await prisma.workLog.findUnique({
    where: { id },
    include: { ...WORK_LOG_INCLUDE, location: { select: { id: true, name: true } } },
  });

  if (!log) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(log);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.workLog.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isAuthor = existing.performedById === session.user.id;
  if (!isAuthor && !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await readJsonBody(req);
  const parsed = updateWorkLogSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInput(parsed.error);
  }

  const data = parsed.data;
  const updated = await prisma.workLog.update({
    where: { id },
    data: {
      ...(data.assetId !== undefined ? { assetId: data.assetId || null } : {}),
      ...(data.itemId !== undefined ? { itemId: data.itemId || null } : {}),
      ...(data.performedById !== undefined ? { performedById: data.performedById } : {}),
      ...(data.performedAt !== undefined ? { performedAt: new Date(data.performedAt) } : {}),
      ...(data.description !== undefined ? { description: data.description ?? "" } : {}),
      ...(data.jiraIssueKey !== undefined ? { jiraIssueKey: data.jiraIssueKey ? data.jiraIssueKey : null } : {}),
    },
    include: WORK_LOG_INCLUDE,
  });

  const changes = auditChanges([
    data.description !== undefined && { label: "Description", before: existing.description, after: data.description },
    data.jiraIssueKey !== undefined && { label: "JIRA issue", before: existing.jiraIssueKey, after: data.jiraIssueKey || null },
    data.performedAt !== undefined && { label: "Performed at", before: toIsoDay(existing.performedAt), after: data.performedAt.split("T")[0] },
  ]);

  await logAudit({
    session,
    req,
    action: "UPDATE",
    entityType: "WorkLog",
    entityId: id,
    entityName: existing.description.slice(0, 60) || undefined,
    detail: Object.keys(changes).length > 0 ? { changes } : undefined,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.workLog.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isAuthor = existing.performedById === session.user.id;
  if (!isAuthor && !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.workLog.delete({ where: { id } });
  await logAudit({
    session,
    req,
    action: "DELETE",
    entityType: "WorkLog",
    entityId: id,
    entityName: existing.description.slice(0, 60) || undefined,
    detail: {
      snapshot: {
        "Description": existing.description,
        "Performed at": toIsoDay(existing.performedAt),
        ...(existing.jiraIssueKey ? { "JIRA issue": existing.jiraIssueKey } : {}),
      },
    },
  });

  return NextResponse.json({ ok: true });
}
