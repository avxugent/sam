import { NextRequest, NextResponse } from "next/server";

/**
 * Validates the Bearer token for Prometheus / monitoring endpoints.
 *
 * - If PROMETHEUS_SD_TOKEN is not configured, returns 503 to prevent
 *   accidental exposure of an unauthenticated endpoint.
 * - If the Authorization header is missing or wrong, returns 401.
 * - Returns null when auth succeeds (caller should proceed).
 */
export function checkPrometheusAuth(req: NextRequest): NextResponse | null {
  const token = process.env.PROMETHEUS_SD_TOKEN;

  if (!token) {
    return NextResponse.json(
      {
        error:
          "Prometheus integration is not configured. " +
          "Set PROMETHEUS_SD_TOKEN in your environment.",
      },
      { status: 503 }
    );
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const [scheme, provided] = authHeader.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || provided !== token) {
    return new NextResponse(
      JSON.stringify({ error: "Unauthorized. Provide a valid Bearer token." }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "WWW-Authenticate": 'Bearer realm="SAM Prometheus"',
        },
      }
    );
  }

  return null; // auth OK
}
