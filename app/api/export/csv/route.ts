import type { NextRequest } from "next/server";
import { adminSessionOrExportToken } from "@/lib/tokens/session-or-export";
import { generateActiveAssetsCsv } from "@/lib/csv/export";
import { logAudit } from "@/lib/audit";
import { toIsoDay } from "@/lib/dates";
import { csvDownload } from "@/lib/route-helpers";

export async function GET(req: NextRequest) {
  const access = await adminSessionOrExportToken(req);
  if ("error" in access) return access.error;
  const { session } = access;

  const csv = await generateActiveAssetsCsv();

  const date = toIsoDay(new Date());
  const filename = `sam-export-${date}.csv`;

  await logAudit({
    session,
    req,
    action: "EXPORT",
    entityType: "Asset",
    detail: { filename },
  });

  return csvDownload(csv, filename);
}
