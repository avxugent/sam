import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateStockCsv } from "@/lib/csv-export";
import { logAudit } from "@/lib/audit";
import { isAdmin } from "@/lib/permissions";
import { toIsoDay } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const csv = await generateStockCsv();

  const date = toIsoDay(new Date());
  const filename = `sam-stock-${date}.csv`;

  await logAudit({
    session,
    req,
    action: "EXPORT",
    entityType: "StockItem",
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
