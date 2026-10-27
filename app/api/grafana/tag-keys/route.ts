import { NextRequest, NextResponse } from "next/server";
import { checkIntegrationToken } from "@/lib/tokens/integration";
import { ADHOC_FILTER_KEYS } from "@/lib/schemas/grafana";

export async function POST(req: NextRequest) {
  const authError = checkIntegrationToken(req);
  if (authError) return authError;

  return NextResponse.json(ADHOC_FILTER_KEYS.map((text) => ({ type: "string", text })));
}
