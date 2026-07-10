import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateExportCsv } from "@/lib/csv-export";
import { logAudit } from "@/lib/audit";
import { checkExportToken } from "@/lib/export-token";

export async function GET(req: NextRequest) {
  const session = await auth();
  const hasToken = checkExportToken(req);

  if (!session?.user && !hasToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
