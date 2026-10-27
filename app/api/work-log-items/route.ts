import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { createWorkLogItemSchema } from "@/lib/work-log-item-schema";
import { isAdmin } from "@/lib/permissions";

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

  const body = await req.json().catch(() => null);
  const parsed = createWorkLogItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const item = await prisma.workLogItem.create({
      data: { name: parsed.data.name, description: parsed.data.description ?? null },
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
  } catch {
    return NextResponse.json({ error: "Name already exists." }, { status: 409 });
  }
}
