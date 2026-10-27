import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { REMEMBER_ME_COOKIE, verifyRememberMeToken } from "@/lib/two-factor/remember-device";

export const proxy = auth(async (req) => {
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

  const session = req.auth;

  // ── Forced password change ───────────────────────────────────────────────
  const needsPasswordChange = session.needsPasswordChange === true;
  const isChangePasswordRoute =
    pathname === "/login/change-password" ||
    pathname.startsWith("/api/users/me") ||
    pathname.startsWith("/api/auth");

  if (needsPasswordChange && !isChangePasswordRoute) {
    return NextResponse.redirect(new URL("/login/change-password", req.url));
  }

  // ── Forced 2FA setup ─────────────────────────────────────────────────────
  const needs2FASetup = session.needs2FASetup === true;
  const is2FASetupRoute =
    pathname === "/login/setup-2fa" ||
    pathname.startsWith("/api/auth/2fa");

  if (needs2FASetup && !is2FASetupRoute) {
    return NextResponse.redirect(new URL("/login/setup-2fa", req.url));
  }

  // ── 2FA pending: password verified but TOTP code not yet entered ────────
  // Allow through: the 2FA challenge page itself and its API endpoint.
  const is2faRoute =
    pathname === "/login/2fa" ||
    pathname.startsWith("/api/auth/2fa/verify");

  const needs2FA = session.needs2FA === true;

  if (needs2FA && !is2faRoute) {
    const userId = session.user?.id ?? "";
    if (userId && await verifyRememberMeToken(req.cookies.get(REMEMBER_ME_COOKIE)?.value, userId)) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/login/2fa", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads).*)"],
};
