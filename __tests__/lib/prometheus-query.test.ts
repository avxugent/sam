import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { roomMonitoring, deviceMonitoring, instantQuery } from "@/lib/prometheus-query";

const fetchMock = vi.fn();

function vector(value: string) {
  return new Response(
    JSON.stringify({
      status: "success",
      data: { resultType: "vector", result: [{ metric: {}, value: [0, value] }] },
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

const empty = () =>
  new Response(
    JSON.stringify({ status: "success", data: { resultType: "vector", result: [] } }),
    { status: 200, headers: { "content-type": "application/json" } }
  );

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PROMETHEUS_URL = "http://prometheus:9090/";
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PROMETHEUS_URL;
  delete process.env.PROMETHEUS_TOKEN;
});

describe("instantQuery()", () => {
  it("returns null rather than throwing when Prometheus is unreachable", async () => {
    // A monitoring summary must never take a page down with it.
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await instantQuery("up")).toBeNull();
  });

  it("returns null on a non-200", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));
    expect(await instantQuery("up")).toBeNull();
  });

  it("returns null when the body is not a successful vector result", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: "error", error: "bad query" }), { status: 200 })
    );
    expect(await instantQuery("up")).toBeNull();
  });

  it("returns null when PROMETHEUS_URL is unset, without calling fetch", async () => {
    delete process.env.PROMETHEUS_URL;
    expect(await instantQuery("up")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the bearer token when one is configured", async () => {
    process.env.PROMETHEUS_TOKEN = "tok";
    fetchMock.mockResolvedValue(vector("1"));
    await instantQuery("up");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
  });

  it("normalises a trailing slash on the base URL", async () => {
    fetchMock.mockResolvedValue(vector("1"));
    await instantQuery("up");
    expect(String(fetchMock.mock.calls[0][0])).toContain("http://prometheus:9090/api/v1/query?");
  });
});

describe("roomMonitoring()", () => {
  it("reads the counts and derives availability", async () => {
    // expected, reporting, down, never scraped, maintenance — in call order.
    fetchMock
      .mockResolvedValueOnce(vector("4"))
      .mockResolvedValueOnce(vector("3"))
      .mockResolvedValueOnce(vector("1"))
      .mockResolvedValueOnce(vector("0"))
      .mockResolvedValueOnce(vector("0"));

    expect(await roomMonitoring("14.10.100.013")).toEqual({
      status: "ok",
      data: {
        expected: 4,
        reporting: 3,
        down: 1,
        neverScraped: 0,
        maintenance: 0,
        availability: 0.75,
      },
    });
  });

  it("treats an absent problem series as zero, not unknown", async () => {
    // A healthy room has no series in room:assets_down:count at all.
    fetchMock
      .mockResolvedValueOnce(vector("2"))
      .mockResolvedValueOnce(vector("2"))
      .mockResolvedValueOnce(empty())
      .mockResolvedValueOnce(empty())
      .mockResolvedValueOnce(empty());

    const r = await roomMonitoring("14.10.100.013");
    expect(r).toMatchObject({
      status: "ok",
      data: { expected: 2, reporting: 2, down: 0, availability: 1 },
    });
  });

  it("reports no-data when Prometheus knows nothing about the room", async () => {
    // expected is the discriminator: without it every other figure is unknown
    // rather than zero, and showing zeros would be a lie.
    fetchMock.mockImplementation(async () => empty());
    expect(await roomMonitoring("99.99.999.999")).toEqual({ status: "no-data" });
  });

  it("distinguishes an unreachable Prometheus from a room it has never heard of", async () => {
    // Collapsing these into one message is what made the earlier failure
    // impossible to act on: one needs a config fix, the other needs rules.
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await roomMonitoring("14.10.100.013")).toEqual({ status: "unreachable" });
  });

  it("reports not-configured when PROMETHEUS_URL is unset, without querying", async () => {
    delete process.env.PROMETHEUS_URL;
    expect(await roomMonitoring("14.10.100.013")).toEqual({ status: "not-configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports null availability for a room with no monitored assets", async () => {
    fetchMock.mockResolvedValueOnce(vector("0")).mockImplementation(async () => empty());
    const r = await roomMonitoring("14.10.100.013");
    expect(r.status === "ok" && r.data.availability).toBeNull();
  });

  it("does not let a quoted FI number break out of the selector", async () => {
    fetchMock.mockImplementation(async () => empty());
    await roomMonitoring('14"} or up{');
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("query")).not.toContain('"} or up{');
  });
});

describe("deviceMonitoring()", () => {
  it("returns the folded state and probe duration", async () => {
    fetchMock.mockResolvedValueOnce(vector("1")).mockResolvedValueOnce(vector("0.076"));
    expect(await deviceMonitoring("rec001")).toEqual({
      status: "ok",
      data: { state: 1, probeDurationSeconds: 0.076 },
    });
  });

  it("distinguishes never-scraped from Prometheus being down", async () => {
    // No probe series, but the asset is in the expected set → never scraped.
    fetchMock
      .mockResolvedValueOnce(empty())
      .mockResolvedValueOnce(empty())
      .mockResolvedValueOnce(vector("1"));
    expect(await deviceMonitoring("proj001")).toEqual({
      status: "ok",
      data: { state: null, probeDurationSeconds: null },
    });
  });

  it("reports no-data when nothing is known at all", async () => {
    fetchMock.mockImplementation(async () => empty());
    expect(await deviceMonitoring("ghost")).toEqual({ status: "no-data" });
  });

  it("reports unreachable rather than no-data when Prometheus is down", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await deviceMonitoring("rec001")).toEqual({ status: "unreachable" });
  });
});
