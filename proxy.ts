import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export const proxy = auth((req) => {
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

  // Prometheus / monitoring endpoints use Bearer token auth, not sessions.
  if (pathname.startsWith("/api/prometheus/")) {
    return NextResponse.next();
  }

  // ── Unauthenticated → redirect to login ────────────────────────────────
  if (!req.auth) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── 2FA pending: password verified but TOTP code not yet entered ────────
  // Allow through: the 2FA challenge page itself and its API endpoint.
  const is2faRoute =
    pathname === "/login/2fa" ||
    pathname.startsWith("/api/auth/2fa/verify");

  const needs2FA = (req.auth as { needs2FA?: boolean }).needs2FA === true;

  if (needs2FA && !is2faRoute) {
    return NextResponse.redirect(new URL("/login/2fa", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads).*)"],
};
