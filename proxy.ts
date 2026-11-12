import { authIncludingPendingSteps } from "@/lib/auth";
import { NextResponse } from "next/server";
import { REMEMBER_ME_COOKIE } from "@/lib/two-factor/remember-device";
import { pendingSignInStep } from "@/lib/two-factor/sign-in-steps";

export const proxy = authIncludingPendingSteps(async (req) => {
  const { pathname } = req.nextUrl;

  // ── Always-public routes ────────────────────────────────────────────────
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/setup") ||
    pathname.startsWith("/setup")
  ) {
    return NextResponse.next();
  }

  // Prometheus / Grafana endpoints use Bearer token auth, not sessions, and
  // by-hostname accepts either; their handlers return 401 themselves.
  if (
    pathname.startsWith("/api/prometheus/") ||
    pathname === "/api/grafana" ||
    pathname.startsWith("/api/grafana/") ||
    pathname === "/api/assets/by-hostname"
  ) {
    return NextResponse.next();
  }

  // Export endpoints accept session OR Bearer EXPORT_TOKEN (external cron /
  // validation tooling). Their handlers return 401 themselves when neither
  // is present — a redirect here would hand HTML to machine clients.
  if (pathname.startsWith("/api/export/")) {
    return NextResponse.next();
  }

  // The MCP endpoint authenticates with a per-user API key (Bearer); its
  // handler returns 401 itself — a redirect would hand HTML to MCP clients.
  if (pathname === "/api/mcp") {
    return NextResponse.next();
  }

  // Branding assets (logo, favicon) are public so they render on the login page
  // and in browser tabs without a session.
  if (pathname.startsWith("/api/branding/")) {
    return NextResponse.next();
  }

  // ── Unauthenticated → redirect to login ────────────────────────────────
  if (!req.auth) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const step = await pendingSignInStep(req.auth, req.cookies.get(REMEMBER_ME_COOKIE)?.value);

  // ── Forced password change ───────────────────────────────────────────────
  const isChangePasswordRoute =
    pathname === "/login/change-password" ||
    pathname.startsWith("/api/users/me");
  if (step === "password-change" && !isChangePasswordRoute) {
    return NextResponse.redirect(new URL("/login/change-password", req.url));
  }

  // ── Forced 2FA setup ─────────────────────────────────────────────────────
  if (step === "2fa-setup" && pathname !== "/login/setup-2fa") {
    return NextResponse.redirect(new URL("/login/setup-2fa", req.url));
  }

  // ── 2FA pending: password verified but second factor not yet entered ────
  if (step === "2fa" && pathname !== "/login/2fa") {
    return NextResponse.redirect(new URL("/login/2fa", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
