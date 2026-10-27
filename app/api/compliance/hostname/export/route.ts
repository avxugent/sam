import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { computeHostnameCompliance } from "@/lib/hostname/compliance";
import { logAudit } from "@/lib/audit";
import { isAdmin } from "@/lib/permissions";
import { escapeCsvCell } from "@/lib/csv";
import { toIsoDay } from "@/lib/utils";
import { csvDownload } from "@/lib/route-helpers";

const COLUMNS = ["TYPE", "PATTERN", "HOSTNAME", "MODEL", "SERIAL", "LOCATION", "FI_NUMBER"];

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
      rows.push(cells.map((cell) => escapeCsvCell(cell)).join(";"));
    }
  }
  const csv = rows.join("\r\n");

  const date = toIsoDay(new Date());
  const filename = `sam-hostname-noncompliant-${date}.csv`;

  await logAudit({
    session,
    req,
    action: "EXPORT",
    entityType: "ComplianceReport",
    detail: { filename, report: "hostname" },
  });

  return csvDownload(csv, filename);
}
