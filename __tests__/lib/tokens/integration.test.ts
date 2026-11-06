import { describe, it, expect, afterEach } from "vitest";
import { integrationTokenResponse } from "@/lib/tokens/integration";
import { NextRequest } from "next/server";

function makeRequest(authHeader?: string): NextRequest {
  const req = new NextRequest("http://localhost/api/prometheus/sd");
  if (authHeader) {
    req.headers.set("authorization", authHeader);
  }
  return req;
}

describe("integrationTokenResponse()", () => {
  const ORIGINAL_TOKEN = process.env.PROMETHEUS_SD_TOKEN;

  afterEach(() => {
    // Restore env after each test
    if (ORIGINAL_TOKEN === undefined) {
      delete process.env.PROMETHEUS_SD_TOKEN;
    } else {
      process.env.PROMETHEUS_SD_TOKEN = ORIGINAL_TOKEN;
    }
  });

  it("returns 503 when PROMETHEUS_SD_TOKEN is not configured", () => {
    delete process.env.PROMETHEUS_SD_TOKEN;
    const result = integrationTokenResponse(makeRequest());
    expect(result).not.toBeNull();
    expect(result!.status).toBe(503);
  });

  it("returns 503 when PROMETHEUS_SD_TOKEN is empty string", () => {
    process.env.PROMETHEUS_SD_TOKEN = "";
    const result = integrationTokenResponse(makeRequest());
    expect(result).not.toBeNull();
    expect(result!.status).toBe(503);
  });

  it("returns 401 when Authorization header is missing", () => {
    process.env.PROMETHEUS_SD_TOKEN = "secret-token";
    const result = integrationTokenResponse(makeRequest());
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it("returns 401 when token is wrong", () => {
    process.env.PROMETHEUS_SD_TOKEN = "correct-token";
    const result = integrationTokenResponse(makeRequest("Bearer wrong-token"));
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it("returns 401 when scheme is not Bearer", () => {
    process.env.PROMETHEUS_SD_TOKEN = "token";
    const result = integrationTokenResponse(makeRequest("Basic token"));
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  it("returns null (auth OK) when token matches exactly", () => {
    process.env.PROMETHEUS_SD_TOKEN = "my-secret-token";
    const result = integrationTokenResponse(makeRequest("Bearer my-secret-token"));
    expect(result).toBeNull();
  });

  it("is case-insensitive for the Bearer scheme keyword", () => {
    process.env.PROMETHEUS_SD_TOKEN = "token123";
    const result = integrationTokenResponse(makeRequest("bearer token123"));
    expect(result).toBeNull();
  });
});
