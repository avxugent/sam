import { describe, it, expect, vi, beforeEach } from "vitest";

// auth(handler) returns the handler itself so the proxy logic can be called directly.
vi.mock("@/lib/auth", () => ({ authIncludingPendingSteps: (handler: unknown) => handler }));
vi.mock("@/lib/two-factor/remember-device", () => ({
  REMEMBER_ME_COOKIE: "sam_2fa_rm",
  verifyRememberMeToken: vi.fn(async () => false),
}));

import { proxy } from "@/proxy";
import { verifyRememberMeToken } from "@/lib/two-factor/remember-device";

type ProxyHandler = (req: unknown) => Promise<Response>;

function call(pathname: string, session: Record<string, unknown> | null = null) {
  const url = `http://localhost${pathname}`;
  return (proxy as unknown as ProxyHandler)({
    nextUrl: new URL(url),
    url,
    auth: session,
    cookies: { get: () => ({ value: "tok" }) },
  });
}

const isRedirectTo = (res: Response, path: string) =>
  res.status >= 300 && res.status < 400 && new URL(res.headers.get("location")!).pathname === path;

beforeEach(() => vi.clearAllMocks());

describe("proxy", () => {
  it.each([
    "/api/prometheus/sd",
    "/api/grafana",
    "/api/grafana/query",
    "/api/assets/by-hostname",
    "/api/export/csv",
    "/api/branding/logo",
    "/login",
    "/api/setup",
  ])("lets %s through without a session (handler does its own auth)", async (path) => {
    const res = await call(path);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects other unauthenticated requests to /login with a callbackUrl", async () => {
    const res = await call("/api/assets/abc");
    expect(isRedirectTo(res, "/login")).toBe(true);
    expect(new URL(res.headers.get("location")!).searchParams.get("callbackUrl")).toBe("/api/assets/abc");
  });

  it("does not exempt look-alike prefixes", async () => {
    expect(isRedirectTo(await call("/api/grafanax"), "/login")).toBe(true);
    expect(isRedirectTo(await call("/api/assets/by-hostname-x"), "/login")).toBe(true);
  });

  it("forces a pending password change", async () => {
    const res = await call("/locations", { user: { id: "u1" }, needsPasswordChange: true });
    expect(isRedirectTo(res, "/login/change-password")).toBe(true);
  });

  it("forces pending 2FA setup", async () => {
    const res = await call("/locations", { user: { id: "u1" }, needs2FASetup: true });
    expect(isRedirectTo(res, "/login/setup-2fa")).toBe(true);
  });

  it("sends a pending 2FA challenge to /login/2fa unless the device is remembered", async () => {
    expect(isRedirectTo(await call("/locations", { user: { id: "u1" }, needs2FA: true }), "/login/2fa")).toBe(true);
    vi.mocked(verifyRememberMeToken).mockResolvedValueOnce(true);
    const res = await call("/locations", { user: { id: "u1" }, needs2FA: true });
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(verifyRememberMeToken).toHaveBeenLastCalledWith("tok", "u1");
  });

  it("passes a fully authenticated session", async () => {
    const res = await call("/locations", { user: { id: "u1" } });
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});
