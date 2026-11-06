import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { computeHostnameCompliance } from "@/lib/compliance/hostname-report";
import { logAudit } from "@/lib/audit";
import { isAdmin } from "@/lib/permissions";
import { generateHostnameComplianceCsv } from "@/lib/csv/export";
import { toIsoDay } from "@/lib/dates";
import { csvDownload } from "@/lib/route-helpers";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { types } = await computeHostnameCompliance();

  const csv = generateHostnameComplianceCsv(types);

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
