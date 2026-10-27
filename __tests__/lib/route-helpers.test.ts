import { describe, it, expect } from "vitest";
import { z } from "zod";
import { csvDownload, invalidInput, isRecordNotFoundError, isUniqueConstraintError, readJsonBody, readMergeRequest } from "@/lib/route-helpers";

describe("readJsonBody()", () => {
  it("returns the parsed body", async () => {
    const req = new Request("http://x", { method: "POST", body: JSON.stringify({ a: 1 }) });
    expect(await readJsonBody(req)).toEqual({ a: 1 });
  });

  it.each([["malformed", "{not json"], ["empty", ""]])("returns null for a %s body", async (_label, body) => {
    const req = new Request("http://x", { method: "POST", body });
    expect(await readJsonBody(req)).toBeNull();
  });
});

describe("invalidInput()", () => {
  const error = z.object({ name: z.string() }).safeParse({}).error!;

  it("returns 400 with flattened field errors", async () => {
    const res = invalidInput(error);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid input");
    expect(Object.keys(body.details.fieldErrors)).toEqual(["name"]);
  });

  it("accepts a custom message", async () => {
    expect((await invalidInput(error, "Invalid code.").json()).error).toBe("Invalid code.");
  });
});

describe("isUniqueConstraintError()", () => {
  it("matches P2002 errors only", () => {
    expect(isUniqueConstraintError(Object.assign(new Error("dup"), { code: "P2002" }))).toBe(true);
    expect(isUniqueConstraintError({ code: "P2025" })).toBe(false);
    expect(isUniqueConstraintError(new Error("boom"))).toBe(false);
    expect(isUniqueConstraintError(null)).toBe(false);
  });
});

describe("isRecordNotFoundError()", () => {
  it("matches P2025 only", () => {
    expect(isRecordNotFoundError({ code: "P2025" })).toBe(true);
    expect(isRecordNotFoundError({ code: "P2002" })).toBe(false);
  });
});

describe("readMergeRequest()", () => {
  const noun = { article: "a", name: "model" } as const;
  const records: Record<string, { id: string }> = { a: { id: "a" }, b: { id: "b" } };
  const load = async (id: string) => records[id] ?? null;
  const req = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body) });

  it("returns both records", async () => {
    expect(await readMergeRequest(req({ targetId: "b" }), "a", noun, load)).toEqual({ source: { id: "a" }, target: { id: "b" }, targetId: "b" });
  });

  it.each([
    [{}, "a", 400, "Invalid input"],
    [{ targetId: "a" }, "a", 400, "Cannot merge a model into itself."],
    [{ targetId: "b" }, "x", 404, "Source model not found."],
    [{ targetId: "x" }, "a", 404, "Target model not found."],
  ])("body %j for source %s → %i", async (body, sourceId, status, message) => {
    const result = await readMergeRequest(req(body), sourceId, noun, load);
    if (!("error" in result)) throw new Error("expected an error");
    expect(result.error.status).toBe(status);
    expect((await result.error.json()).error).toBe(message);
  });
});

describe("csvDownload()", () => {
  it("serves an uncached CSV attachment", async () => {
    const res = csvDownload("a;b", "x.csv");
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="x.csv"');
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.text()).toBe("a;b");
  });
});
