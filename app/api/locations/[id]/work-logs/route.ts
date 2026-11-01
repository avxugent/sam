import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createWorkLogSchema } from "@/lib/schemas/work-log";
import { WORK_LOG_INCLUDE } from "@/lib/work-logs/include";
import { canEdit } from "@/lib/permissions";
import { assetLabel } from "@/lib/assets/label";
import { invalidInput, isForeignKeyError, notFoundResponse, readJsonBody, unknownReferenceResponse } from "@/lib/route-helpers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const logs = await prisma.workLog.findMany({
    where: { locationId: id },
    include: WORK_LOG_INCLUDE,
    orderBy: [{ performedAt: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(logs);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: locationId } = await params;
  const body = await readJsonBody(req);
  const parsed = createWorkLogSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInput(parsed.error);
  }

  // Verify location exists
  const location = await prisma.location.findUnique({ where: { id: locationId }, select: { id: true, name: true } });
  if (!location) return notFoundResponse("Location");

  const data = parsed.data;
  const performedById = data.performedById || session.user.id;
  const performedAt = data.performedAt ? new Date(data.performedAt) : new Date();

  let created;
  try {
    created = await prisma.workLog.create({
      data: {
        locationId,
        assetId: data.assetId || null,
        itemId: data.itemId || null,
        performedById,
        performedAt,
        description: data.description ?? "",
        jiraIssueKey: data.jiraIssueKey ? data.jiraIssueKey : null,
      },
      include: WORK_LOG_INCLUDE,
    });
  } catch (err) {
    // A stale asset, item or performer id from the body.
    if (isForeignKeyError(err)) return unknownReferenceResponse();
    throw err;
  }

  const assetName = created.asset
    ? assetLabel(created.asset)
    : null;

  await logAudit({
    session,
    req,
    action: "CREATE",
    entityType: "WorkLog",
    entityId: created.id,
    entityName: `Work log @ ${location.name}`,
    detail: {
      snapshot: {
        "Location": location.name,
        ...(created.item ? { "Item": created.item.name } : {}),
        ...(assetName ? { "Asset": assetName } : {}),
        ...(created.jiraIssueKey ? { "JIRA issue": created.jiraIssueKey } : {}),
      },
    },
  });

  return NextResponse.json(created, { status: 201 });
}
