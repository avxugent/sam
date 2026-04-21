// @vitest-environment node
// rate-limit.ts calls setInterval(...).unref() at module load time.
// The jsdom environment's setInterval returns a number with no .unref();
// running in the Node environment gives a proper Timeout object.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("checkRateLimit()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Import inside each test block so the module re-initialises with a fresh
  // in-memory store between describe runs when using vi.resetModules().
  async function getCheckRateLimit() {
    const { checkRateLimit } = await import("@/lib/rate-limit");
    return checkRateLimit;
  }

  it("allows the first request on a fresh key", async () => {
    const checkRateLimit = await getCheckRateLimit();
    const result = checkRateLimit("rl:first", 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.retryAfterMs).toBe(0);
  });

  it("allows requests up to the max limit", async () => {
    const checkRateLimit = await getCheckRateLimit();
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit("rl:max", 5, 60_000).allowed).toBe(true);
    }
  });

  it("blocks the request that exceeds the limit", async () => {
    const checkRateLimit = await getCheckRateLimit();
    for (let i = 0; i < 5; i++) checkRateLimit("rl:exceed", 5, 60_000);
    const result = checkRateLimit("rl:exceed", 5, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("resets after the window expires", async () => {
    const checkRateLimit = await getCheckRateLimit();
    checkRateLimit("rl:reset", 1, 60_000);
    expect(checkRateLimit("rl:reset", 1, 60_000).allowed).toBe(false);

    vi.advanceTimersByTime(61_000);

    expect(checkRateLimit("rl:reset", 1, 60_000).allowed).toBe(true);
  });

  it("retryAfterMs is within the window duration", async () => {
    const checkRateLimit = await getCheckRateLimit();
    checkRateLimit("rl:retry", 1, 60_000);
    const result = checkRateLimit("rl:retry", 1, 60_000);
    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect(result.retryAfterMs).toBeLessThanOrEqual(60_000);
  });
});
