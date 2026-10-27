import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateExportCsv } from "@/lib/csv-export";
import { logAudit } from "@/lib/audit";
import { checkExportToken } from "@/lib/export-token";
import { isAdmin } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const session = await auth();
  const hasToken = checkExportToken(req);

  if (!hasToken) {
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const csv = await generateExportCsv();

  const date = new Date().toISOString().slice(0, 10);
  const filename = `sam-export-${date}.csv`;

  await logAudit({
    session,
    req,
    action: "EXPORT",
    entityType: "Asset",
    detail: { filename },
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
