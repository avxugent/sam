import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { signInIncompleteResponse } from "@/lib/two-factor/sign-in-steps";
import { generateStockCsv } from "@/lib/csv-export";
import { logAudit } from "@/lib/audit";
import { isAdmin } from "@/lib/permissions";
import { toIsoDay } from "@/lib/utils";
import { csvDownload } from "@/lib/route-helpers";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const incomplete = await signInIncompleteResponse(session);
  if (incomplete) return incomplete;
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

  return csvDownload(csv, filename);
}
