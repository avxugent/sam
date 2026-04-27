import { NextRequest, NextResponse } from "next/server";
import { checkPrometheusAuth } from "@/lib/prometheus-auth";

export async function GET(req: NextRequest) {
  const authError = checkPrometheusAuth(req);
  if (authError) return authError;
  return NextResponse.json({ status: "ok" });
}
