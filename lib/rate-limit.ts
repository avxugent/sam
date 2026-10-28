/**
 * Simple in-memory rate limiter.
 *
 * Suitable for single-instance deployments. For multi-instance setups behind a
 * load balancer, replace the Map with a shared store (e.g. Redis).
 *
 * A background sweep runs every 5 minutes to evict expired entries and prevent
 * unbounded memory growth.
 */

type Entry = { count: number; resetAt: number };
type RateLimitState = { store: Map<string, Entry>; sweeping: boolean };

// Kept on globalThis (like the Prisma client) so a dev hot reload reuses one
// store and one sweep timer instead of resetting every limit and stacking
// another interval.
const globalForRateLimit = globalThis as typeof globalThis & { __samRateLimit?: RateLimitState };
const state = (globalForRateLimit.__samRateLimit ??= { store: new Map(), sweeping: false });

// Periodic cleanup — remove entries whose window has already passed. Started
// on first use rather than at import time.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
function ensureSweep() {
  if (state.sweeping) return;
  state.sweeping = true;
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of state.store) {
      if (entry.resetAt <= now) state.store.delete(key);
    }
  }, SWEEP_INTERVAL_MS);
  timer.unref?.(); // don't keep the process alive (absent in browser-like environments)
}

/**
 * Check whether the given key is within its rate-limit window.
 *
 * @param key         Unique key (e.g. `login:192.0.2.1` or `2fa:userId:ip`)
 * @param maxRequests Maximum number of requests allowed within `windowMs`
 * @param windowMs    Window length in milliseconds
 * @returns `allowed: true` when the request should proceed;
 *          `allowed: false` with `retryAfterMs` when the limit is exceeded
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; retryAfterMs: number } {
  ensureSweep();
  const now = Date.now();
  const entry = state.store.get(key);

  if (!entry || entry.resetAt <= now) {
    state.store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  entry.count += 1;
  if (entry.count > maxRequests) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  return { allowed: true, retryAfterMs: 0 };
}
