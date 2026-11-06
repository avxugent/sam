import { NextRequest, NextResponse } from "next/server";
import { integrationTokenResponse } from "@/lib/tokens/integration";

export async function GET(req: NextRequest) {
  const authError = integrationTokenResponse(req);
  if (authError) return authError;
  return NextResponse.json({ status: "ok" });
}
