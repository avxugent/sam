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
 * Rendered panels are cached in-process for a short window.
 *
 * Each render is a full headless-browser page load — seconds, not milliseconds
 * — so re-rendering on every page view made embedding barely usable. The cache
 * key is the complete upstream URL, so a different time range, room or device
 * is a different entry and nobody sees another user's view. Grafana is queried
 * with a fixed service-account token, so the image does not vary by SAM user.
 *
 * The TTL is deliberately close to the recording-rule interval: the underlying
 * numbers only change once a minute, so a fresher image would show the same
 * data at more cost.
 */
const RENDER_CACHE_TTL_MS = Number(process.env.GRAFANA_RENDER_CACHE_MS ?? 60_000);
const RENDER_CACHE_MAX_ENTRIES = 200;

type CacheEntry = { body: ArrayBuffer; contentType: string; expires: number };
const renderCache = new Map<string, CacheEntry>();

function cacheGet(key: string): CacheEntry | null {
  const hit = renderCache.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    renderCache.delete(key);
    return null;
  }
  // Refresh insertion order so the eviction below is roughly least-recently-used.
  renderCache.delete(key);
  renderCache.set(key, hit);
  return hit;
}

/**
 * Empties the cache. Exists for tests: the cache is module-level, so without a
 * reset one test's rendered panel is served to the next.
 */
export function clearRenderCache(): void {
  renderCache.clear();
}

function cacheSet(key: string, entry: CacheEntry): void {
  if (renderCache.size >= RENDER_CACHE_MAX_ENTRIES) {
    const oldest = renderCache.keys().next().value;
    if (oldest !== undefined) renderCache.delete(oldest);
  }
  renderCache.set(key, entry);
}

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

  const cacheKey = upstream.toString();
  const cached = cacheGet(cacheKey);
  if (cached) {
    return new NextResponse(cached.body, {
      status: 200,
      headers: {
        "Content-Type": cached.contentType,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-SAM-Render-Cache": "hit",
      },
    });
  }

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
  const contentType = res.headers.get("content-type") ?? "image/png";
  if (RENDER_CACHE_TTL_MS > 0) {
    cacheSet(cacheKey, { body, contentType, expires: Date.now() + RENDER_CACHE_TTL_MS });
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      // Cached server-side, not in the browser: the TTL is ours to control and
      // a stale image in someone's browser cache would outlive a config change.
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-SAM-Render-Cache": "miss",
    },
  });
}
