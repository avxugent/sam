import { NextRequest, NextResponse } from "next/server";
import { checkPrometheusAuth } from "@/lib/prometheus-auth";
import { ADHOC_FILTER_KEYS } from "@/lib/schemas/grafana";

export async function POST(req: NextRequest) {
  const authError = checkPrometheusAuth(req);
  if (authError) return authError;

  return NextResponse.json(ADHOC_FILTER_KEYS.map((text) => ({ type: "string", text })));
}
