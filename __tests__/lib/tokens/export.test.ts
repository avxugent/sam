import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { checkExportToken } from "@/lib/tokens/export";

function req(authHeader?: string) {
  return new Request("http://x", {
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

const ORIGINAL = process.env.EXPORT_TOKEN;

beforeEach(() => {
  process.env.EXPORT_TOKEN = "secret-token";
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.EXPORT_TOKEN;
  else process.env.EXPORT_TOKEN = ORIGINAL;
});

describe("checkExportToken()", () => {
  it("accepts a matching Bearer token (case-insensitive scheme)", () => {
    expect(checkExportToken(req("Bearer secret-token"))).toBe(true);
    expect(checkExportToken(req("bearer secret-token"))).toBe(true);
  });

  it("rejects a wrong token, wrong scheme, or missing header", () => {
    expect(checkExportToken(req("Bearer nope"))).toBe(false);
    expect(checkExportToken(req("Basic secret-token"))).toBe(false);
    expect(checkExportToken(req())).toBe(false);
  });

  it("rejects everything when EXPORT_TOKEN is unset", () => {
    delete process.env.EXPORT_TOKEN;
    expect(checkExportToken(req("Bearer secret-token"))).toBe(false);
  });
});
