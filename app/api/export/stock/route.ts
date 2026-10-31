import type { NextRequest } from "next/server";
import { adminSessionOrExportToken } from "@/lib/tokens/session-or-export";
import { generateStockCsv } from "@/lib/csv/export";
import { logAudit } from "@/lib/audit";
import { toIsoDay } from "@/lib/dates";
import { csvDownload } from "@/lib/route-helpers";

export async function GET(req: NextRequest) {
  const access = await adminSessionOrExportToken(req);
  if (access.response) return access.response;
  const { session } = access;

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
