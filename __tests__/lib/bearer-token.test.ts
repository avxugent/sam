// @vitest-environment node
import { describe, it, expect } from "vitest";
import { hasBearerToken } from "@/lib/bearer-token";

const req = (authorization?: string) =>
  new Request("http://x", { headers: authorization ? { authorization } : {} });

describe("hasBearerToken()", () => {
  it("matches the expected token, case-insensitive scheme", () => {
    expect(hasBearerToken(req("Bearer s3cret"), "s3cret")).toBe(true);
    expect(hasBearerToken(req("bearer s3cret"), "s3cret")).toBe(true);
  });

  it("rejects wrong, missing or differently-sized tokens", () => {
    expect(hasBearerToken(req("Bearer nope00"), "s3cret")).toBe(false);
    expect(hasBearerToken(req("Bearer s3cret-longer"), "s3cret")).toBe(false);
    expect(hasBearerToken(req("Bearer"), "s3cret")).toBe(false);
    expect(hasBearerToken(req("Basic s3cret"), "s3cret")).toBe(false);
    expect(hasBearerToken(req(), "s3cret")).toBe(false);
  });

  it("never matches when no token is configured", () => {
    expect(hasBearerToken(req("Bearer "), undefined)).toBe(false);
    expect(hasBearerToken(req("Bearer x"), "")).toBe(false);
  });
});
