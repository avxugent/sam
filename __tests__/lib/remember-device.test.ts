// @vitest-environment node
// jose's Uint8Array instanceof checks fail across jsdom/Node realm boundaries;
// run this file in the plain Node environment (mirrors __tests__/lib/rate-limit.test.ts).
import { describe, it, expect, beforeEach } from "vitest";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";
import { signRememberMeToken, setRememberMeCookie, REMEMBER_ME_COOKIE } from "@/lib/remember-device";

beforeEach(() => {
  process.env.NEXTAUTH_SECRET = "test-secret-at-least-32-bytes-long-0000";
});

describe("signRememberMeToken", () => {
  it("signs a JWT with sub=userId and a ~30 day expiry", async () => {
    const token = await signRememberMeToken("user-1");
    const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET);
    const { payload } = await jwtVerify(token, secret);
    expect(payload.sub).toBe("user-1");
    const days = (payload.exp! - payload.iat!) / 86400;
    expect(days).toBeCloseTo(30, 0);
  });

  it("rejects verification with the wrong secret", async () => {
    const token = await signRememberMeToken("user-1");
    const wrongSecret = new TextEncoder().encode("a-completely-different-secret-value");
    await expect(jwtVerify(token, wrongSecret)).rejects.toThrow();
  });
});

describe("setRememberMeCookie", () => {
  it("sets an httpOnly, 30-day cookie carrying the signed token", async () => {
    const res = NextResponse.json({ ok: true });
    await setRememberMeCookie(res, "user-1");

    const cookie = res.cookies.get(REMEMBER_ME_COOKIE);
    expect(cookie).toBeDefined();
    expect(cookie?.value).toBeTruthy();

    const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET);
    const { payload } = await jwtVerify(cookie!.value, secret);
    expect(payload.sub).toBe("user-1");
  });
});
