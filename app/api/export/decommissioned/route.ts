import type { NextRequest } from "next/server";
import { adminSessionOrExportToken } from "@/lib/tokens/session-or-export";
import { generateDecommissionedCsv } from "@/lib/csv/export";
import { logAudit } from "@/lib/audit";
import { toIsoDay } from "@/lib/utils";
import { csvDownload } from "@/lib/route-helpers";

export async function GET(req: NextRequest) {
  const access = await adminSessionOrExportToken(req);
  if (access.response) return access.response;
  const { session } = access;

  const csv = await generateDecommissionedCsv();

  const date = toIsoDay(new Date());
  const filename = `sam-decommissioned-${date}.csv`;

  await logAudit({
    session,
    req,
    action: "EXPORT",
    entityType: "Asset",
    detail: { filename, scope: "decommissioned" },
  });

  return csvDownload(csv, filename);
}
