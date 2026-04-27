import { NextRequest, NextResponse } from "next/server";
import { checkPrometheusAuth } from "@/lib/prometheus-auth";

export async function POST(req: NextRequest) {
  const authError = checkPrometheusAuth(req);
  if (authError) return authError;

  return NextResponse.json([
    { type: "string", text: "type" },
    { type: "string", text: "manufacturer" },
    { type: "string", text: "location" },
    { type: "string", text: "hostname" },
  ]);
}
