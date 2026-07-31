import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/auth", () => ({ __esModule: true, auth: vi.fn() }));

import { auth } from "@/lib/auth";
import { GET } from "@/app/api/grafana-embed/[dashboard]/route";
import { NextRequest } from "next/server";

const mockAuth = vi.mocked(auth);
const params = (dashboard: string) => ({ params: Promise.resolve({ dashboard }) });

function req(query: string) {
  return new NextRequest(`http://localhost/api/grafana-embed/room?${query}`);
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "u1", role: "VIEWER" } } as never);
  process.env.GRAFANA_URL = "http://grafana:3000/";
  process.env.GRAFANA_TOKEN = "svc-token";
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(
    new Response("<html>panel</html>", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
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

  it("resolves the UID itself rather than trusting the request", async () => {
    await GET(req("panelId=6&var-fi_number=14.10.100.013"), params("room"));
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe("/d-solo/sam-room/room");
    expect(url.searchParams.get("var-fi_number")).toBe("14.10.100.013");
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
    expect(String(fetchMock.mock.calls[0][0])).toContain("http://grafana:3000/d-solo/");
  });

  it("restricts framing to SAM itself", async () => {
    const res = await GET(req("panelId=1"), params("room"));
    expect(res.headers.get("content-security-policy")).toBe("frame-ancestors 'self'");
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
