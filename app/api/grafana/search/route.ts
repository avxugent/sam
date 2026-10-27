import { NextRequest, NextResponse } from "next/server";
import { checkIntegrationToken } from "@/lib/tokens/integration";

const TARGETS = [
  "assets_table",
  "assets_by_type",
  "assets_by_manufacturer",
  "assets_by_location",
  "assets_by_install_year",
];

export async function POST(req: NextRequest) {
  const authError = checkIntegrationToken(req);
  if (authError) return authError;
  return NextResponse.json(TARGETS);
}
