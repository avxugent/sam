/**
 * Bearer-token check for the export endpoints (EXPORT_TOKEN env var), used
 * alongside session auth so external cron jobs can pull exports.
 */
export function checkExportToken(req: Request): boolean {
  const token = process.env.EXPORT_TOKEN;
  if (!token) return false;
  const authHeader = req.headers.get("authorization") ?? "";
  const [scheme, provided] = authHeader.split(" ");
  return scheme?.toLowerCase() === "bearer" && provided === token;
}
