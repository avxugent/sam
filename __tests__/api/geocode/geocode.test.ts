import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/lib/auth";

import { GET as geocode } from "@/app/api/geocode/route";

const mockAuth = vi.mocked(auth);
const session = (role = "ADMIN") => ({ user: { id: "u1", role, email: "a@b.com" } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("GET /api/geocode", () => {
  function req(q?: string) {
    const u = new URL("http://localhost/api/geocode");
    if (q !== undefined) u.searchParams.set("q", q);
    return new NextRequest(u);
  }
  it("401 unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    expect((await geocode(req("brussels"))).status).toBe(401);
  });
  it("403 for viewers, without calling the geocoder", async () => {
    mockAuth.mockResolvedValue(session("VIEWER") as never);
    global.fetch = vi.fn();
    expect((await geocode(req("ghent"))).status).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it("400 when query is missing", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    expect((await geocode(req())).status).toBe(400);
  });
  it("passes through Nominatim results", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    const data = [{ display_name: "Ghent, BE", lat: "51.05", lon: "3.72" }];
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => data } as never);
    const res = await geocode(req("ghent"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(data);
  });
  it("400 for a blank or over-long query, without calling the geocoder", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    global.fetch = vi.fn();
    expect((await geocode(req("   "))).status).toBe(400);
    const res = await geocode(req("x".repeat(201)));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid input");
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it("502 with a code when the upstream geocoder fails", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 } as never);
    const res = await geocode(req("ghent"));
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("geocodeUnavailable");
  });
  it("502 (not a 500) when the geocoder times out", async () => {
    mockAuth.mockResolvedValue(session("EDITOR") as never);
    global.fetch = vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    expect((await geocode(req("ghent"))).status).toBe(502);
  });
});
