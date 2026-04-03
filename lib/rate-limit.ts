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

const store = new Map<string, Entry>();

// Periodic cleanup — remove entries whose window has already passed
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}, SWEEP_INTERVAL_MS).unref(); // .unref() so the timer doesn't keep the process alive

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
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  entry.count += 1;
  if (entry.count > maxRequests) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  return { allowed: true, retryAfterMs: 0 };
}
