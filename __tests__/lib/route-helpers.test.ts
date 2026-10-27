import { describe, it, expect } from "vitest";
import { z } from "zod";
import { invalidInput, isUniqueConstraintError, readJsonBody } from "@/lib/route-helpers";

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
