import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createReportSchema } from "@/lib/report-schema";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const reports = await prisma.report.findMany({
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, description: true, createdById: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json(reports);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = createReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const { name, description, definition } = parsed.data;
  const report = await prisma.report.create({
    data: {
      name,
      description,
      definition: JSON.stringify(definition),
      createdById: session.user.id,
    },
  });

  await logAudit({
    session,
    req,
    action: "CREATE",
    entityType: "Report",
    entityId: report.id,
    entityName: report.name,
  });

  return NextResponse.json(report, { status: 201 });
}
