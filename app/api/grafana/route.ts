import { NextRequest, NextResponse } from "next/server";
import { integrationTokenError } from "@/lib/tokens/integration";

export async function GET(req: NextRequest) {
  const authError = integrationTokenError(req);
  if (authError) return authError;
  return NextResponse.json({ status: "ok" });
}
