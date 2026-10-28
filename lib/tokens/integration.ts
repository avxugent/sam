import { NextRequest, NextResponse } from "next/server";
import { hasBearerToken } from "@/lib/tokens/bearer";

/**
 * Validates the integration Bearer token (PROMETHEUS_SD_TOKEN) shared by the
 * Prometheus and Grafana endpoints.
 *
 * - If PROMETHEUS_SD_TOKEN is not configured, returns 503 to prevent
 *   accidental exposure of an unauthenticated endpoint.
 * - If the Authorization header is missing or wrong, returns 401.
 * - Returns null when auth succeeds (caller should proceed).
 */
export function integrationTokenError(req: NextRequest): NextResponse | null {
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

  if (!hasBearerToken(req, token)) {
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
