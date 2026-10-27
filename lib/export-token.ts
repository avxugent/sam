import { hasBearerToken } from "@/lib/bearer-token";

/**
 * Bearer-token check for the export endpoints (EXPORT_TOKEN env var), used
 * alongside session auth so external cron jobs can pull exports.
 */
export function checkExportToken(req: Request): boolean {
  return hasBearerToken(req, process.env.EXPORT_TOKEN);
}
