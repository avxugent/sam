import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { updateWorkLogSchema } from "@/lib/work-log-schema";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const log = await prisma.workLog.findUnique({
    where: { id },
    include: {
      performedBy: { select: { id: true, name: true, email: true } },
      item: { select: { id: true, name: true } },
      asset: {
        select: {
          id: true,
          model: { select: { name: true } },
          serialNumber: true,
          hostname: true,
          type: { select: { id: true, name: true } },
        },
      },
      location: { select: { id: true, name: true } },
    },
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
  const isAdmin = session.user.role === "ADMIN";
  if (!isAuthor && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = updateWorkLogSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
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
    include: {
      performedBy: { select: { id: true, name: true, email: true } },
      item: { select: { id: true, name: true } },
      asset: {
        select: {
          id: true,
          model: { select: { name: true } },
          serialNumber: true,
          hostname: true,
          type: { select: { id: true, name: true } },
        },
      },
    },
  });

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (data.description !== undefined && data.description !== existing.description)
    changes["Description"] = { from: existing.description, to: data.description };
  if (data.jiraIssueKey !== undefined && (data.jiraIssueKey || null) !== existing.jiraIssueKey)
    changes["JIRA issue"] = { from: existing.jiraIssueKey ?? null, to: data.jiraIssueKey || null };
  if (data.performedAt !== undefined) {
    const fromDate = existing.performedAt.toISOString().split("T")[0];
    const toDate = data.performedAt.split("T")[0];
    if (fromDate !== toDate)
      changes["Performed at"] = { from: fromDate, to: toDate };
  }

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
  const isAdmin = session.user.role === "ADMIN";
  if (!isAuthor && !isAdmin) {
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
        "Performed at": existing.performedAt.toISOString().split("T")[0],
        ...(existing.jiraIssueKey ? { "JIRA issue": existing.jiraIssueKey } : {}),
      },
    },
  });

  return new NextResponse(null, { status: 204 });
}
