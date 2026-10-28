import { describe, it, expect, vi, afterEach } from "vitest";
import { apiFetch, downloadFile, jsonBody } from "@/lib/api-client";

afterEach(() => vi.unstubAllGlobals());

describe("apiFetch()", () => {
  it("returns the parsed body on success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "a1" }), { status: 201 })));
    expect(await apiFetch("/api/x")).toEqual({ ok: true, status: 201, data: { id: "a1" } });
  });

  it("returns the error body on an API error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Nope", code: "x" }), { status: 409 })));
    expect(await apiFetch("/api/x")).toEqual({ ok: false, status: 409, error: { error: "Nope", code: "x" } });
  });

  it("copes with an error response that has no JSON body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Bad gateway", { status: 502 })));
    expect(await apiFetch("/api/x")).toEqual({ ok: false, status: 502, error: {} });
  });

  it("never throws on a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    expect(await apiFetch("/api/x")).toEqual({ ok: false, status: 0, error: {} });
  });

  it("passes the request init through", async () => {
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    await apiFetch("/api/x", jsonBody("PATCH", { a: 1 }));
    expect(fetchMock).toHaveBeenCalledWith("/api/x", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: '{"a":1}' });
  });
});

describe("downloadFile()", () => {
  it("saves the response body under the given name", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("A;B")));
    const createObjectURL = vi.fn(() => "blob:1");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    expect(await downloadFile("/api/export/csv", "sam.csv")).toBe(true);
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:1");
    click.mockRestore();
  });

  it("resolves false for a refused or failed request", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 403 })));
    expect(await downloadFile("/x", "x.csv")).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    expect(await downloadFile("/x", "x.csv")).toBe(false);
  });
});
