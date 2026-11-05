import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { auditChanges } from "@/lib/audit/diff";
import { updateWorkLogSchema } from "@/lib/schemas/work-log";
import { WORK_LOG_INCLUDE } from "@/lib/work-logs/include";
import { canModifyWorkLog } from "@/lib/permissions";
import { userNamesById } from "@/lib/users/names";
import { invalidInput, isForeignKeyError, isRecordNotFoundError, notFoundResponse, readJsonBody, unknownReferenceResponse } from "@/lib/route-helpers";
import { toIsoDay } from "@/lib/dates";

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

  if (!log) return notFoundResponse("Work log");
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
  if (!existing) return notFoundResponse("Work log");

  if (!canModifyWorkLog(session.user.role, session.user.id, existing.performedById)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await readJsonBody(req);
  const parsed = updateWorkLogSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInput(parsed.error);
  }

  const data = parsed.data;
  let updated;
  try {
    updated = await prisma.workLog.update({
      where: { id },
      data: {
        assetId: data.assetId === undefined ? undefined : data.assetId || null,
        itemId: data.itemId === undefined ? undefined : data.itemId || null,
        performedById: data.performedById,
        performedAt: data.performedAt === undefined ? undefined : new Date(data.performedAt),
        description: data.description === undefined ? undefined : data.description ?? "",
        jiraIssueKey: data.jiraIssueKey === undefined ? undefined : data.jiraIssueKey || null,
      },
      include: WORK_LOG_INCLUDE,
    });
  } catch (err) {
    // Deleted by a concurrent request since the read.
    if (isRecordNotFoundError(err)) return notFoundResponse("Work log");
    // A stale asset, item or performer id from the body.
    if (isForeignKeyError(err)) return unknownReferenceResponse();
    throw err;
  }

  // performedById is also the ownership key (canModifyWorkLog), so a change of
  // performer is an ownership transfer and must show in the audit diff.
  const performerChanged = data.performedById !== undefined && data.performedById !== existing.performedById;
  const performerNames = performerChanged ? await userNamesById([existing.performedById]) : new Map<string, string>();
  const changes = auditChanges([
    data.description !== undefined && { label: "Description", before: existing.description, after: data.description },
    data.jiraIssueKey !== undefined && { label: "JIRA issue", before: existing.jiraIssueKey, after: data.jiraIssueKey || null },
    data.performedAt !== undefined && { label: "Performed at", before: toIsoDay(existing.performedAt), after: data.performedAt },
    performerChanged && {
      label: "Performed by",
      before: existing.performedById,
      after: updated.performedBy.id,
      display: [performerNames.get(existing.performedById) ?? existing.performedById, updated.performedBy.name],
    },
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
  if (!existing) return notFoundResponse("Work log");

  if (!canModifyWorkLog(session.user.role, session.user.id, existing.performedById)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await prisma.workLog.delete({ where: { id } });
  } catch (err) {
    // Deleted by a concurrent request since the read.
    if (isRecordNotFoundError(err)) return notFoundResponse("Work log");
    throw err;
  }
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
