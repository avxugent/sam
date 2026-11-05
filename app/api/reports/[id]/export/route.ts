import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runReport } from "@/lib/reports/engine";
import { parseReportDefinition } from "@/lib/schemas/report";
import { csvDownload, notFoundResponse } from "@/lib/route-helpers";
import { generateReportCsv } from "@/lib/csv/export";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const report = await prisma.report.findUnique({ where: { id } });
  if (!report) return notFoundResponse("Report");

  const definition = parseReportDefinition(report.definition);
  if (!definition) {
    return NextResponse.json({ error: "Report definition is invalid." }, { status: 422 });
  }

  // Uncapped: a download must hold every matching row, not the on-screen cap.
  const csv = generateReportCsv(definition, await runReport(definition, { capRows: false }));
  const filename = `${report.name.replace(/[^a-z0-9]/gi, "_")}.csv`;

  await logAudit({
    session,
    req,
    action: "EXPORT",
    entityType: "Report",
    entityId: report.id,
    entityName: report.name,
    detail: { filename },
  });

  return csvDownload(csv, filename);
}
