/**
 * GET /api/export/snapshot
 *
 * Point-in-time JSON inventory snapshot (assets incl. NIS2 fields, suppliers,
 * locations). Auth: ADMIN session OR EXPORT_TOKEN Bearer (same pattern as
 * /api/export/csv) so an external cron can archive dated snapshots.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminSessionOrExportToken } from "@/lib/tokens/session-or-export";
import { buildInventorySnapshot } from "@/lib/inventory-snapshot";
import { logAudit } from "@/lib/audit";
import { toIsoDay } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const access = await adminSessionOrExportToken(req);
  if (access.response) return access.response;
  const { session } = access;

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
