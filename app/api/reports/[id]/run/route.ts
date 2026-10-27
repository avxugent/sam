import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runReport } from "@/lib/reports/engine";
import { reportDefinitionSchema } from "@/lib/schemas/report";
import type { ReportDefinition } from "@/lib/reports/types";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const report = await prisma.report.findUnique({ where: { id } });
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let definition: ReportDefinition;
  try {
    definition = reportDefinitionSchema.parse(JSON.parse(report.definition));
  } catch {
    return NextResponse.json({ error: "Report definition is invalid" }, { status: 422 });
  }

  const result = await runReport(definition);
  return NextResponse.json(result);
}
