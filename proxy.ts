import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const REMEMBER_COOKIE = "sam_2fa_rm";

async function isRemembered(req: Parameters<Parameters<typeof auth>[0]>[0], userId: string): Promise<boolean> {
  const token = req.cookies.get(REMEMBER_COOKIE)?.value;
  if (!token) return false;
  try {
    const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET ?? "");
    const { payload } = await jwtVerify(token, secret);
    return payload.sub === userId;
  } catch {
    return false;
  }
}

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

  const auth = req.auth as { needs2FA?: boolean; needsPasswordChange?: boolean; needs2FASetup?: boolean };

  // ── Forced password change ───────────────────────────────────────────────
  const needsPasswordChange = auth.needsPasswordChange === true;
  const isChangePasswordRoute =
    pathname === "/login/change-password" ||
    pathname.startsWith("/api/users/me") ||
    pathname.startsWith("/api/auth");

  if (needsPasswordChange && !isChangePasswordRoute) {
    return NextResponse.redirect(new URL("/login/change-password", req.url));
  }

  // ── Forced 2FA setup ─────────────────────────────────────────────────────
  const needs2FASetup = auth.needs2FASetup === true;
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

  const needs2FA = auth.needs2FA === true;

  if (needs2FA && !is2faRoute) {
    const userId = (req.auth as { user?: { id?: string } })?.user?.id ?? "";
    if (userId && await isRemembered(req, userId)) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/login/2fa", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads).*)"],
};
