import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { hasValidExportToken } from "@/lib/tokens/export";

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

describe("hasValidExportToken()", () => {
  it("accepts a matching Bearer token (case-insensitive scheme)", () => {
    expect(hasValidExportToken(req("Bearer secret-token"))).toBe(true);
    expect(hasValidExportToken(req("bearer secret-token"))).toBe(true);
  });

  it("rejects a wrong token, wrong scheme, or missing header", () => {
    expect(hasValidExportToken(req("Bearer nope"))).toBe(false);
    expect(hasValidExportToken(req("Basic secret-token"))).toBe(false);
    expect(hasValidExportToken(req())).toBe(false);
  });

  it("rejects everything when EXPORT_TOKEN is unset", () => {
    delete process.env.EXPORT_TOKEN;
    expect(hasValidExportToken(req("Bearer secret-token"))).toBe(false);
  });
});
