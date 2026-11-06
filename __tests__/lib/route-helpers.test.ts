import { describe, it, expect } from "vitest";
import { z } from "zod";
import { csvDownload, formFile, formText, invalidInput, isRecordNotFoundError, isUniqueConstraintError, nameTakenResponse, notFoundResponse, readJsonBody } from "@/lib/route-helpers";
import { readMergeRequest, nameConflictResponse } from "@/lib/catalog/merge";

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
    [{ targetId: "x" }, "a", 400, "Target model does not exist."],
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

describe("nameConflictResponse()", () => {
  it("answers 409 with the existing record for the merge offer", async () => {
    const res = nameConflictResponse("Name already exists.", { id: "x", name: "Dell", _count: { assets: 3, stockItems: 1 } });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "Name already exists.",
      code: "nameConflict",
      existingId: "x",
      existingName: "Dell",
      existingAssetCount: 3,
      existingStockCount: 1,
    });
  });

  it("omits the stock count when the catalog has none", async () => {
    const res = nameConflictResponse("dup", { id: "x", name: "Recorder", _count: { assets: 0 } });
    expect(await res.json()).not.toHaveProperty("existingStockCount");
  });
});

describe("notFoundResponse()", () => {
  it("names the missing record", async () => {
    const res = notFoundResponse("Model");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Model not found." });
  });
});

describe("nameTakenResponse()", () => {
  it("answers 409 with the default or a given message", async () => {
    const res = nameTakenResponse();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Name already exists." });
    expect(await nameTakenResponse("Taken.").json()).toEqual({ error: "Taken." });
  });
});

describe("formFile() / formText()", () => {
  const form = { get: (name: string) => ({ file: new Blob(["x"]), text: "hello", empty: "" } as Record<string, unknown>)[name] ?? null } as unknown as FormData;

  it("returns a file only for a file entry", () => {
    expect(formFile(form, "file")).toBeInstanceOf(Blob);
    expect(formFile(form, "text")).toBeNull();
    expect(formFile(form, "missing")).toBeNull();
  });

  it("returns text only for a non-empty text entry", () => {
    expect(formText(form, "text")).toBe("hello");
    expect(formText(form, "empty")).toBeNull();
    expect(formText(form, "file")).toBeNull();
    expect(formText(form, "missing")).toBeNull();
  });
});
