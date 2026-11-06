import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { geocodeAddress } from "@/lib/integrations/geocode";

const origFetch = global.fetch;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  global.fetch = origFetch;
  vi.restoreAllMocks();
});

describe("geocodeAddress()", () => {
  it("returns Nominatim's results and bounds the request with a timeout", async () => {
    const results = [{ display_name: "Ghent, BE", lat: "51.05", lon: "3.72" }];
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => results } as never);
    expect(await geocodeAddress("Sint-Pietersnieuwstraat 25, Gent")).toEqual({ status: "found", results });
    const [url, init] = vi.mocked(global.fetch).mock.calls[0];
    expect(url).toContain("q=Sint-Pietersnieuwstraat%2025%2C%20Gent");
    expect(url).toContain("limit=5");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("is unavailable on an error status", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429 } as never);
    expect(await geocodeAddress("Gent")).toEqual({ status: "unavailable" });
  });

  it("is unavailable when the body is not a result list", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ error: "x" }) } as never);
    expect(await geocodeAddress("Gent")).toEqual({ status: "unavailable" });
  });

  it("is unavailable when the body is not JSON", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError("bad json"); } } as never);
    expect(await geocodeAddress("Gent")).toEqual({ status: "unavailable" });
  });

  it("is unavailable on a timeout or network failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    expect(await geocodeAddress("Gent")).toEqual({ status: "unavailable" });
  });
});
