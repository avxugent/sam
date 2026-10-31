import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runReport } from "@/lib/reports/engine";
import { parseReportDefinition } from "@/lib/schemas/report";
import { csvDownload, notFoundResponse } from "@/lib/route-helpers";
import { isLocationReport } from "@/lib/reports/types";
import type { ColumnKey } from "@/lib/reports/types";
import { escapeCsvCell } from "@/lib/csv/core";

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
  supplier: "Supplier",
  criticality: "Criticality",
  endOfSupportDate: "End of Support",
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const report = await prisma.report.findUnique({ where: { id } });
  if (!report) return notFoundResponse();

  const definition = parseReportDefinition(report.definition);
  if (!definition) {
    return NextResponse.json({ error: "Report definition is invalid" }, { status: 422 });
  }

  const result = await runReport(definition);

  let csv: string;
  if (isLocationReport(definition) && result.source === "location") {
    const header = ["Campus", "Building", "Room", "FI number", ...result.itemColumns.map((c) => c.name)]
      .map((h) => escapeCsvCell(h, ","))
      .join(",");
    const csvRows = result.rows.map((row) =>
      [
        escapeCsvCell(row.campus, ","),
        escapeCsvCell(row.building, ","),
        escapeCsvCell(row.name, ","),
        escapeCsvCell(row.fiNumber, ","),
        ...result.itemColumns.map((c) => {
          const s = row.items[c.id];
          if (s?.filled) return escapeCsvCell(`Filled${s.date ? ` (${s.date})` : ""}`, ",");
          return escapeCsvCell(s?.date ? `Overdue (${s.date})` : "Not filled", ",");
        }),
      ].join(",")
    );
    csv = [header, ...csvRows].join("\n");
  } else if (!isLocationReport(definition) && result.source === "asset") {
    const cols = definition.columns;
    const header = cols.map((c) => escapeCsvCell(COLUMN_LABELS[c], ",")).join(",");
    const csvRows = result.rows.map((row) =>
      cols.map((c) => escapeCsvCell(row[c] as string | null, ",")).join(",")
    );
    csv = [header, ...csvRows].join("\n");
  } else {
    csv = "";
  }

  return csvDownload(csv, `${report.name.replace(/[^a-z0-9]/gi, "_")}.csv`);
}
