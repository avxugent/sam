import { describe, it, expect } from "vitest";
import { clientIp, tooManyAttempts } from "@/lib/rate-limit/http";

describe("clientIp()", () => {
  it("prefers the first X-Forwarded-For hop, then X-Real-IP", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe("203.0.113.5");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientIp(new Headers())).toBeNull();
  });
});

describe("tooManyAttempts()", () => {
  it("returns 429 with Retry-After in whole seconds", async () => {
    const res = tooManyAttempts(1500);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("2");
    expect((await res.json()).error).toMatch(/Too many attempts/);
  });
});
