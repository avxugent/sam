import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createWorkLogItemSchema } from "@/lib/schemas/work-log-item";
import { isAdmin } from "@/lib/permissions";
import { invalidInput, isUniqueConstraintError, nameTakenResponse, readJsonBody } from "@/lib/route-helpers";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await prisma.workLogItem.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: { _count: { select: { workLogs: true } } },
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await readJsonBody(req);
  const parsed = createWorkLogItemSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInput(parsed.error);
  }

  try {
    const item = await prisma.workLogItem.create({
      data: { name: parsed.data.name, description: parsed.data.description ?? null },
      // Same shape as a GET list item, so the client can insert it as-is.
      include: { _count: { select: { workLogs: true } } },
    });
    await logAudit({
      session,
      req,
      action: "CREATE",
      entityType: "WorkLogItem",
      entityId: item.id,
      entityName: item.name,
    });
    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return nameTakenResponse();
    }
    throw err;
  }
}
