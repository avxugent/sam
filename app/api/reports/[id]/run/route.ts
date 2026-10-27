import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runReport } from "@/lib/reports/engine";
import { parseReportDefinition } from "@/lib/schemas/report";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const report = await prisma.report.findUnique({ where: { id } });
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const definition = parseReportDefinition(report.definition);
  if (!definition) {
    return NextResponse.json({ error: "Report definition is invalid" }, { status: 422 });
  }

  const result = await runReport(definition);
  return NextResponse.json(result);
}
