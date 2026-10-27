import { NextRequest, NextResponse } from "next/server";
import { checkIntegrationToken } from "@/lib/tokens/integration";

export async function GET(req: NextRequest) {
  const authError = checkIntegrationToken(req);
  if (authError) return authError;
  return NextResponse.json({ status: "ok" });
}
