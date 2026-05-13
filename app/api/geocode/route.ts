import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "q is required" }, { status: 400 });

  const upstream = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(q)}`;

  const res = await fetch(upstream, {
    headers: {
      "Accept-Language": "en",
      "User-Agent": "SAM/2 (UGent internal asset management)",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Geocoding service error" }, { status: 502 });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
