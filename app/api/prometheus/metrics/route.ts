/**
 * GET /api/prometheus/metrics
 *
 * Exposes SAM inventory data in Prometheus text exposition format, rendered
 * by renderInventoryMetrics() in lib/prometheus/metrics.ts.
 *
 * Authentication: Bearer token via PROMETHEUS_SD_TOKEN env var.
 *
 * Prometheus scrape_configs example:
 *
 *   scrape_configs:
 *     - job_name: "sam_inventory"
 *       metrics_path: /api/prometheus/metrics
 *       scheme: https
 *       authorization:
 *         type: Bearer
 *         credentials: "<PROMETHEUS_SD_TOKEN>"
 *       static_configs:
 *         - targets: ["sam.example.com"]
 */

import { NextRequest, NextResponse } from "next/server";
import { integrationTokenResponse } from "@/lib/tokens/integration";
import { renderInventoryMetrics } from "@/lib/prometheus/metrics";

export async function GET(req: NextRequest) {
  const authError = integrationTokenResponse(req);
  if (authError) return authError;

  return new NextResponse(await renderInventoryMetrics(), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
