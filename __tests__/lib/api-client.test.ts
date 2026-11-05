import { describe, it, expect, vi, afterEach } from "vitest";
import { apiErrorMessage, apiFetch, downloadFile, jsonBody, saveBlob } from "@/lib/api-client";

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
    await apiFetch("/api/x", jsonBody("PUT", { a: 1 }));
    expect(fetchMock).toHaveBeenCalledWith("/api/x", { method: "PUT", headers: { "Content-Type": "application/json" }, body: '{"a":1}' });
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

describe("saveBlob()", () => {
  it("clicks a download link named after the file and releases the object URL", () => {
    const createObjectURL = vi.fn(() => "blob:2");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL }));
    let downloaded = "";
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloaded = this.download;
    });

    saveBlob(new Blob(["x"]), "assets.csv");
    expect(downloaded).toBe("assets.csv");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:2");
    click.mockRestore();
  });
});

describe("apiErrorMessage()", () => {
  it("appends string details to the error", () => {
    expect(apiErrorMessage({ error: "Template syntax error", details: ["Line 2: Missing \"=\"", "Line 4: Duplicate key"] })).toBe(
      'Template syntax error: Line 2: Missing "="; Line 4: Duplicate key'
    );
  });

  it("ignores Zod's structured details object", () => {
    expect(apiErrorMessage({ error: "Invalid input", details: { fieldErrors: { name: ["Required"] } } })).toBe("Invalid input");
  });

  it("falls back when the body has no error", () => {
    expect(apiErrorMessage({}, "Something went wrong")).toBe("Something went wrong");
  });
});
