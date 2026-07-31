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
 * Reverse-proxies a single rendered Grafana panel (`/d-solo/...`) so SAM can
 * embed it. Grafana is reached server-side with a service-account token, which
 * means Grafana needs no browser-reachable URL, no anonymous access, and its
 * token never reaches the client.
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
const ALLOWED_PARAMS = new Set(["panelId", "from", "to", "theme", "refresh", "orgId"]);

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

  const upstream = new URL(`${grafanaBaseUrl()}/d-solo/${target.uid}/${target.slug}`);
  for (const [key, value] of req.nextUrl.searchParams) {
    // Dashboard variables are caller-supplied but confined to var-* names, so
    // they can only select data, never redirect the request.
    if (ALLOWED_PARAMS.has(key) || key.startsWith("var-")) {
      upstream.searchParams.append(key, value);
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
      "Content-Type": res.headers.get("content-type") ?? "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      // The response is Grafana's HTML rendered inside a SAM iframe; keep it
      // framable by SAM alone.
      "Content-Security-Policy": "frame-ancestors 'self'",
    },
  });
}
