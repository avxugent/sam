import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runReport } from "@/lib/report-engine";
import { reportDefinitionSchema } from "@/lib/report-schema";
import type { ReportDefinition, ColumnKey } from "@/lib/report-types";

const COLUMN_LABELS: Record<ColumnKey, string> = {
  model: "Model",
  serialNumber: "Serial Number",
  hostname: "Hostname",
  type: "Type",
  manufacturer: "Manufacturer",
  location: "Location",
  installationDate: "Installation Date",
  invoiceDate: "Invoice Date",
  invoiceNumber: "Invoice Number",
  notes: "Notes",
  lastChanged: "Last Modified",
};

function escapeCell(v: string | null | undefined): string {
  const s = v ?? "";
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

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

  const { rows } = await runReport(definition);
  const cols = definition.columns;

  const header = cols.map((c) => COLUMN_LABELS[c]).join(",");
  const csvRows = rows.map((row) =>
    cols.map((c) => escapeCell(row[c] as string | null)).join(",")
  );
  const csv = [header, ...csvRows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${report.name.replace(/[^a-z0-9]/gi, "_")}.csv"`,
    },
  });
}
