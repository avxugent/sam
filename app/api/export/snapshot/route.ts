/**
 * GET /api/export/snapshot
 *
 * Point-in-time JSON inventory snapshot (assets incl. NIS2 fields, suppliers,
 * locations). Auth: session OR EXPORT_TOKEN Bearer (same pattern as
 * /api/export/csv) so an external cron can archive dated snapshots.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildInventorySnapshot } from "@/lib/inventory-snapshot";
import { checkExportToken } from "@/lib/export-token";
import { logAudit } from "@/lib/audit";
import { toIsoDay } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const session = await auth();
  const hasToken = checkExportToken(req);

  if (!session?.user && !hasToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snapshot = await buildInventorySnapshot();

  const date = toIsoDay(new Date());
  const filename = `sam-inventory-${date}.json`;

  await logAudit({
    session,
    req,
    action: "EXPORT",
    entityType: "Inventory",
    entityName: filename,
    detail: { ...snapshot.counts },
  });

  return new NextResponse(JSON.stringify(snapshot, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
