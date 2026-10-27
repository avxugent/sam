import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { computeHostnameCompliance } from "@/lib/hostname-compliance";
import { logAudit } from "@/lib/audit";
import { isAdmin } from "@/lib/permissions";

const COLUMNS = ["TYPE", "PATTERN", "HOSTNAME", "MODEL", "SERIAL", "LOCATION", "FI_NUMBER"];

function escapeCell(value: string): string {
  if (value.includes(";") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { types } = await computeHostnameCompliance();

  const rows: string[] = [COLUMNS.join(";")];
  for (const t of types) {
    for (const a of t.nonCompliantAssets) {
      const cells = [
        t.typeName,
        t.pattern ?? "",
        a.hostname,
        a.model ?? "",
        a.serialNumber ?? "",
        a.locationPath ?? "",
        a.fiNumber ?? "",
      ];
      rows.push(cells.map(escapeCell).join(";"));
    }
  }
  const csv = rows.join("\r\n");

  const date = new Date().toISOString().slice(0, 10);
  const filename = `sam-hostname-noncompliant-${date}.csv`;

  await logAudit({
    session,
    req,
    action: "EXPORT",
    entityType: "ComplianceReport",
    detail: { filename, report: "hostname" },
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
