import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { geocodeAddress } from "@/lib/integrations/geocode";
import { invalidInput } from "@/lib/route-helpers";

const querySchema = z.object({
  q: z.string().trim().min(1).max(200),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return invalidInput(parsed.error);

  const lookup = await geocodeAddress(parsed.data.q);
  if (lookup.status === "unavailable") {
    return NextResponse.json({ error: "The geocoding service could not be reached.", code: "geocodeUnavailable" }, { status: 502 });
  }
  return NextResponse.json(lookup.results);
}
