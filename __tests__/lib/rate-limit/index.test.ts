// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("consumeRateLimit()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Fresh store and sweep timer per test: the state lives on globalThis.
    delete (globalThis as { __samRateLimit?: unknown }).__samRateLimit;
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function getCheckRateLimit() {
    const { consumeRateLimit } = await import("@/lib/rate-limit");
    return consumeRateLimit;
  }

  it("allows the first request on a fresh key", async () => {
    const consumeRateLimit = await getCheckRateLimit();
    const result = consumeRateLimit("rl:first", 5, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.retryAfterMs).toBe(0);
  });

  it("allows requests up to the max limit", async () => {
    const consumeRateLimit = await getCheckRateLimit();
    for (let i = 0; i < 5; i++) {
      expect(consumeRateLimit("rl:max", 5, 60_000).allowed).toBe(true);
    }
  });

  it("blocks the request that exceeds the limit", async () => {
    const consumeRateLimit = await getCheckRateLimit();
    for (let i = 0; i < 5; i++) consumeRateLimit("rl:exceed", 5, 60_000);
    const result = consumeRateLimit("rl:exceed", 5, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("resets after the window expires", async () => {
    const consumeRateLimit = await getCheckRateLimit();
    consumeRateLimit("rl:reset", 1, 60_000);
    expect(consumeRateLimit("rl:reset", 1, 60_000).allowed).toBe(false);

    vi.advanceTimersByTime(61_000);

    expect(consumeRateLimit("rl:reset", 1, 60_000).allowed).toBe(true);
  });

  it("retryAfterMs is within the window duration", async () => {
    const consumeRateLimit = await getCheckRateLimit();
    consumeRateLimit("rl:retry", 1, 60_000);
    const result = consumeRateLimit("rl:retry", 1, 60_000);
    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect(result.retryAfterMs).toBeLessThanOrEqual(60_000);
  });

  it("sweeps expired entries in the background", async () => {
    const consumeRateLimit = await getCheckRateLimit();
    consumeRateLimit("rl:sweep", 1, 1_000);
    const state = (globalThis as { __samRateLimit?: { store: Map<string, unknown> } }).__samRateLimit!;
    expect(state.store.has("rl:sweep")).toBe(true);
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(state.store.has("rl:sweep")).toBe(false);
  });

  it("keeps one store across module reloads (dev hot reload)", async () => {
    (await getCheckRateLimit())("rl:reload", 1, 60_000);
    vi.resetModules();
    expect((await getCheckRateLimit())("rl:reload", 1, 60_000).allowed).toBe(false);
  });
});
