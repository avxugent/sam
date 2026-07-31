import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/auth", () => ({ __esModule: true, auth: vi.fn() }));

import { auth } from "@/lib/auth";
import { GET, clearRenderCache } from "@/app/api/grafana-embed/[dashboard]/route";
import { NextRequest } from "next/server";

const mockAuth = vi.mocked(auth);
const params = (dashboard: string) => ({ params: Promise.resolve({ dashboard }) });

function req(query: string) {
  return new NextRequest(`http://localhost/api/grafana-embed/room?${query}`);
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  // The render cache is module-level, so it survives between tests.
  clearRenderCache();
  mockAuth.mockResolvedValue({ user: { id: "u1", role: "VIEWER" } } as never);
  process.env.GRAFANA_URL = "http://grafana:3000/";
  process.env.GRAFANA_TOKEN = "svc-token";
  vi.stubGlobal("fetch", fetchMock);
  // A fresh Response per call: a body can only be read once, and real fetch
  // hands back a new one every time.
  fetchMock.mockImplementation(
    async () =>
      new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
        status: 200,
        headers: { "content-type": "image/png" },
      })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GRAFANA_URL;
  delete process.env.GRAFANA_TOKEN;
});

describe("GET /api/grafana-embed/[dashboard]", () => {
  it("401 unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await GET(req("panelId=1"), params("room"))).status).toBe(401);
  });

  it("503 when Grafana is not configured", async () => {
    delete process.env.GRAFANA_TOKEN;
    expect((await GET(req("panelId=1"), params("room"))).status).toBe(503);
  });

  it("404 for a dashboard that is not on the allowlist", async () => {
    // The whole point of the allowlist: a SAM session must not be usable to
    // reach arbitrary Grafana paths.
    expect((await GET(req("panelId=1"), params("../admin"))).status).toBe(404);
    expect((await GET(req("panelId=1"), params("anything"))).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders server-side rather than serving the Grafana SPA", async () => {
    // /d-solo/ is the whole Grafana app; its absolute asset paths would resolve
    // against SAM inside a frame. /render returns a finished PNG instead.
    await GET(req("panelId=6&var-fi_number=14.10.100.013"), params("room"));
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe("/render/d-solo/sam-room/room");
    expect(url.searchParams.get("var-fi_number")).toBe("14.10.100.013");
  });

  it("returns the image with a nosniff header", async () => {
    const res = await GET(req("panelId=1"), params("room"));
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("clamps rendering geometry", async () => {
    // The renderer drives a headless browser, so an unbounded width would let
    // any signed-in user tie it up.
    await GET(req("panelId=1&width=99999&height=99999&scale=50"), params("room"));
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("width")).toBe("2000");
    expect(url.searchParams.get("height")).toBe("2000");
    expect(url.searchParams.get("scale")).toBe("3");
  });

  it("drops geometry that is not a positive number", async () => {
    await GET(req("panelId=1&width=abc&height=-5"), params("room"));
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.has("width")).toBe(false);
    expect(url.searchParams.has("height")).toBe(false);
  });

  it("sends the service-account token upstream", async () => {
    await GET(req("panelId=1"), params("room"));
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer svc-token");
  });

  it("drops query parameters that are not allowlisted", async () => {
    await GET(
      req("panelId=1&from=now-1h&var-fi_number=x&render=1&url=http://evil&kiosk=1"),
      params("room")
    );
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("panelId")).toBe("1");
    expect(url.searchParams.get("from")).toBe("now-1h");
    expect(url.searchParams.get("var-fi_number")).toBe("x");
    // Anything not needed for rendering is not forwarded, so nothing can be
    // smuggled into the upstream request.
    expect(url.searchParams.has("render")).toBe(false);
    expect(url.searchParams.has("url")).toBe(false);
    expect(url.searchParams.has("kiosk")).toBe(false);
  });

  it("normalises a trailing slash on GRAFANA_URL", async () => {
    await GET(req("panelId=1"), params("room"));
    expect(String(fetchMock.mock.calls[0][0])).toContain("http://grafana:3000/render/d-solo/");
  });

  it("does not cache one user's time range for the next", async () => {
    const res = await GET(req("panelId=1"), params("room"));
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("502 when Grafana is unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    expect((await GET(req("panelId=1"), params("room"))).status).toBe(502);
  });

  it("502 when Grafana errors, without leaking its body", async () => {
    fetchMock.mockResolvedValue(new Response("stack trace", { status: 500 }));
    const res = await GET(req("panelId=1"), params("room"));
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain("stack trace");
  });
});

describe("render caching", () => {
  it("serves a repeat request from cache instead of re-rendering", async () => {
    // Each render is a headless-browser page load, so re-rendering on every
    // page view is what made embedding unusably slow.
    const first = await GET(req("panelId=1&var-fi_number=A"), params("room"));
    const second = await GET(req("panelId=1&var-fi_number=A"), params("room"));

    expect(first.headers.get("x-sam-render-cache")).toBe("miss");
    expect(second.headers.get("x-sam-render-cache")).toBe("hit");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keys the cache on every parameter, so one room cannot show another's data", async () => {
    await GET(req("panelId=1&var-fi_number=A"), params("room"));
    await GET(req("panelId=1&var-fi_number=B"), params("room"));
    await GET(req("panelId=2&var-fi_number=A"), params("room"));
    await GET(req("panelId=1&from=now-1h&var-fi_number=A"), params("room"));
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("never caches an upstream failure", async () => {
    fetchMock.mockImplementation(async () => new Response("boom", { status: 500 }));
    await GET(req("panelId=9&var-fi_number=Z"), params("room"));
    await GET(req("panelId=9&var-fi_number=Z"), params("room"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
