import { NextResponse } from "next/server";

/** Client IP from the reverse proxy headers (first X-Forwarded-For hop, else X-Real-IP), or null. */
export function clientIp(headers: Headers): string | null {
  return headers.get("x-forwarded-for")?.split(",")[0].trim() ?? headers.get("x-real-ip") ?? null;
}

/** 429 response for a request that exceeded its rate limit. */
export function tooManyAttempts(retryAfterMs: number): NextResponse {
  return NextResponse.json(
    { error: "Too many attempts. Please try again later." },
    { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
  );
}
