import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  EMBEDDABLE_DASHBOARDS,
  grafanaBaseUrl,
  isGrafanaConfigured,
  type EmbeddableDashboard,
} from "@/lib/grafana";

/**
 * GET /api/grafana-embed/[dashboard]?panelId=…&var-…=…
 *
 * Proxies a single Grafana panel rendered to PNG (`/render/d-solo/...`) so SAM
 * can display it as an image. Grafana is reached server-side with a
 * service-account token, which means Grafana needs no browser-reachable URL, no
 * anonymous access, and its token never reaches the client.
 *
 * An image rather than an iframe: `/d-solo/` serves the whole Grafana SPA,
 * whose absolute asset and API paths would resolve against SAM inside a frame
 * and 404. Rendering server-side sidesteps that entirely and needs no CSP
 * exemption, since `img-src 'self'` already permits the result.
 *
 * Requires the grafana-image-renderer plugin; without it Grafana answers /render
 * with an error, which surfaces here as a 502.
 *
 * This is an authenticated hole through to another service, so it is
 * deliberately narrow:
 *
 *   * only the dashboards in EMBEDDABLE_DASHBOARDS, by key rather than by a
 *     UID taken from the request — otherwise a SAM session could be used to
 *     reach Grafana's admin or datasource APIs
 *   * only GET, and only the /d-solo path
 *   * only an allowlisted set of query parameters, so nothing can be smuggled
 *     through into the upstream URL
 */

// Panel rendering needs these; anything else is dropped rather than forwarded.
const ALLOWED_PARAMS = new Set([
  "panelId",
  "from",
  "to",
  "theme",
  "orgId",
  // Rendering geometry. Bounded below so a caller cannot ask Grafana's renderer
  // for a huge image and tie up the browser it runs.
  "width",
  "height",
  "scale",
  "tz",
]);

const NUMERIC_PARAMS: Record<string, number> = { width: 2000, height: 2000, scale: 3 };

/**
 * Clamps rendering geometry. Only the numeric parameters are checked — `from`
 * and `to` are Grafana time expressions like "now-1h" and must pass through
 * untouched. Returns null to drop a value that is not a positive number, so a
 * malformed size falls back to Grafana's default rather than erroring.
 */
function sanitize(key: string, value: string): string | null {
  const max = NUMERIC_PARAMS[key];
  if (max === undefined) return value;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(Math.min(n, max));
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ dashboard: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isGrafanaConfigured()) {
    return NextResponse.json(
      { error: "Grafana embedding is not configured. Set GRAFANA_URL and GRAFANA_TOKEN." },
      { status: 503 }
    );
  }

  const { dashboard } = await params;
  const target = EMBEDDABLE_DASHBOARDS[dashboard as EmbeddableDashboard];
  if (!target) return NextResponse.json({ error: "Unknown dashboard" }, { status: 404 });

  const upstream = new URL(`${grafanaBaseUrl()}/render/d-solo/${target.uid}/${target.slug}`);
  for (const [key, value] of req.nextUrl.searchParams) {
    // Dashboard variables are caller-supplied but confined to var-* names, so
    // they can only select data, never redirect the request.
    if (key.startsWith("var-")) {
      upstream.searchParams.append(key, value);
    } else if (ALLOWED_PARAMS.has(key)) {
      const clean = sanitize(key, value);
      if (clean !== null) upstream.searchParams.append(key, clean);
    }
  }
  if (!upstream.searchParams.has("orgId")) upstream.searchParams.set("orgId", "1");

  let res: Response;
  try {
    res = await fetch(upstream, {
      headers: { Authorization: `Bearer ${process.env.GRAFANA_TOKEN}` },
      // Panels are live data; caching them here would show one user's time
      // range to the next.
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Grafana is unreachable" }, { status: 502 });
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: `Grafana returned ${res.status}` },
      { status: res.status === 404 ? 404 : 502 }
    );
  }

  const body = await res.arrayBuffer();
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "image/png",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
