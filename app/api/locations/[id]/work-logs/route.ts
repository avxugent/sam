import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createWorkLogSchema } from "@/lib/work-log-schema";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const logs = await prisma.workLog.findMany({
    where: { locationId: id },
    include: {
      performedBy: { select: { id: true, name: true, email: true } },
      asset: {
        select: {
          id: true,
          model: true,
          serialNumber: true,
          hostname: true,
          type: { select: { id: true, name: true } },
        },
      },
    },
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
  if (session.user.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: locationId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = createWorkLogSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  // Verify location exists
  const location = await prisma.location.findUnique({ where: { id: locationId }, select: { id: true, name: true } });
  if (!location) return NextResponse.json({ error: "Location not found" }, { status: 404 });

  const data = parsed.data;
  const performedById = data.performedById || session.user.id!;
  const performedAt = data.performedAt ? new Date(data.performedAt) : new Date();

  const created = await prisma.workLog.create({
    data: {
      locationId,
      assetId: data.assetId || null,
      performedById,
      performedAt,
      description: data.description,
      jiraIssueKey: data.jiraIssueKey ? data.jiraIssueKey : null,
    },
    include: {
      performedBy: { select: { id: true, name: true, email: true } },
      asset: {
        select: {
          id: true,
          model: true,
          serialNumber: true,
          hostname: true,
          type: { select: { id: true, name: true } },
        },
      },
    },
  });

  const assetName = created.asset
    ? (created.asset.model ?? created.asset.serialNumber ?? created.asset.hostname ?? null)
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
        ...(assetName ? { "Asset": assetName } : {}),
        ...(created.jiraIssueKey ? { "JIRA issue": created.jiraIssueKey } : {}),
      },
    },
  });

  return NextResponse.json(created, { status: 201 });
}
