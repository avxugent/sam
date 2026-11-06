import { timingSafeEqual } from "node:crypto";

/**
 * Whether the request carries `Authorization: Bearer <expected>`. An unset
 * `expected` never matches, so an unconfigured token can't open an endpoint.
 * Compared in constant time to avoid leaking the token through timing.
 */
export function hasBearerToken(req: Request, expected: string | undefined): boolean {
  if (!expected) return false;
  const [scheme, provided] = (req.headers.get("authorization") ?? "").split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
