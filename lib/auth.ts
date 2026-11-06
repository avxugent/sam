import NextAuth, { type Session } from "next-auth";
import { cookies } from "next/headers";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { consumeRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/rate-limit/http";
import { logAudit } from "@/lib/audit";
import { auditLoginFailure } from "@/lib/audit/login";
import { isTwoFactorSetupRequired } from "@/lib/two-factor/policy";
import { verifyUpgradeProof } from "@/lib/two-factor/upgrade-proof";
import { readComplianceSetting } from "@/lib/app-settings";
import { REMEMBER_ME_COOKIE } from "@/lib/two-factor/remember-device";
import { pendingSignInStep } from "@/lib/two-factor/sign-in-steps";

const loginSchema = z.object({
  email: z.email().max(255),
  password: z.string().min(1),
});

/**
 * True when Microsoft Entra ID SSO is configured: all three env vars present.
 * Read at import because the provider list below is built at import.
 */
export const ssoEnabled =
  !!process.env.AUTH_MICROSOFT_ENTRA_ID_ID &&
  !!process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET &&
  !!process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER;

/**
 * The pending login-step flags authorize() sets, copied into the JWT and the
 * session. needs2FA: owes a 2FA code challenge (TOTP or passkey already
 * enrolled). needs2FASetup: must enrol a second factor first.
 * needsPasswordChange: must replace an admin-set password.
 */
const PENDING_STEP_FLAGS = ["needs2FA", "needsPasswordChange", "needs2FASetup"] as const;

const nextAuth = NextAuth({
  providers: [
    // ── Primary credentials provider ──────────────────────────────────────
    Credentials({
      id: "credentials",
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        // Rate-limit by IP (broad) and by email (per-account)
        const ip = clientIp(request.headers) ?? "unknown";
        const ipRl = consumeRateLimit(`login:ip:${ip}`, 20, 15 * 60 * 1000);
        const emailRl = consumeRateLimit(`login:email:${parsed.data.email}`, 10, 15 * 60 * 1000);
        if (!ipRl.allowed || !emailRl.allowed) {
          auditLoginFailure({ req: request, entityName: parsed.data.email, detail: { reason: "rate_limited" } });
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            passwordHash: true,
            totpEnabled: true,
            mustChangePassword: true,
            twoFactorRequired: true,
            _count: { select: { passkeys: true } },
          },
        });

        // Reject if user has no password (SSO-only account)
        if (!user || !user.passwordHash) {
          auditLoginFailure({ req: request, entityName: parsed.data.email, detail: { reason: user ? "sso_only" : "unknown_user" } });
          return null;
        }

        const valid = await bcrypt.compare(
          parsed.data.password,
          user.passwordHash
        );
        if (!valid) {
          auditLoginFailure({ req: request, entityId: user.id, entityName: parsed.data.email, detail: { reason: "invalid_password" } });
          return null;
        }

        const identity = { id: user.id, name: user.name, email: user.email, role: user.role };

        // Forced enrollment flags take priority over 2FA challenge
        if (user.mustChangePassword) return { ...identity, needsPasswordChange: true };

        const hasPasskey = user._count.passkeys > 0;

        // Global requirement (AppSetting) ORs with the per-user flag
        const requireTwoFactor = await readComplianceSetting("requireTwoFactor");
        if (isTwoFactorSetupRequired({ ...user, hasPasskey }, requireTwoFactor)) {
          return { ...identity, needs2FASetup: true };
        }

        return {
          ...identity,
          // Signal that a 2FA step is still required before granting full access
          needs2FA: (user.totpEnabled || hasPasskey) ? true : undefined,
        };
      },
    }),

    // ── Second-factor upgrade provider ────────────────────────────────────
    // Called internally by /api/auth/2fa/verify (TOTP) and
    // /api/auth/passkey/authentication-verify (passkey) once the second
    // factor is confirmed. Issues a clean session without the needs2FA flag.
    Credentials({
      id: "credentials-2fa-verified",
      name: "credentials-2fa-verified",
      credentials: {
        userId: { label: "User ID", type: "text" },
        // Which second factor was used — audit-log detail only, never
        // affects authorization.
        method: { label: "Method", type: "text" },
        // Server-signed proof from upgradeSession(); this provider is also
        // reachable over HTTP, so a bare userId must never be enough.
        proof: { label: "Proof", type: "text" },
      },
      async authorize(credentials) {
        const userId =
          typeof credentials?.userId === "string"
            ? credentials.userId
            : null;
        if (!userId) return null;
        if (!(await verifyUpgradeProof(credentials?.proof, userId))) return null;

        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true, email: true, role: true, passwordHash: true },
        });

        // Must still be a credentials user with a password
        if (!user || !user.passwordHash) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          // No needs2FA — this is the verified session
          // Only the two known values reach the audit detail, never arbitrary text.
          method: credentials?.method === "passkey" ? "passkey" : "totp",
        };
      },
    }),

    // Only include Entra ID provider when configured
    ...(ssoEnabled
      ? [
          MicrosoftEntraID({
            clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
            clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!,
            issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER!,
            authorization: {
              params: {
                scope: "openid profile email",
              },
            },
          }),
        ]
      : []),
  ],

  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "microsoft-entra-id") {
        if (!user.email) return false;

        const existing = await prisma.user.findUnique({
          where: { email: user.email },
        });

        if (!existing) {
          const newUser = await prisma.user.create({
            data: {
              name: user.name || user.email,
              email: user.email,
              passwordHash: null,
              provider: "microsoft-entra-id",
              role: "VIEWER",
            },
          });
          user.id = newUser.id;
          user.role = "VIEWER";
        } else {
          user.id = existing.id;
          user.role = existing.role;
        }
        return true;
      }
      return true;
    },

    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        for (const flag of PENDING_STEP_FLAGS) {
          if (user[flag]) token[flag] = true;
          else delete token[flag];
        }
        token.dbCheck = Math.floor(Date.now() / 1000);
      }

      // Every 5 minutes, re-read the user: a deleted user loses the session
      // (null), and a role change (e.g. a demotion) reaches the token within
      // 5 minutes instead of at the next sign-in.
      if (!token.id) return null;
      const now = Math.floor(Date.now() / 1000);
      const lastCheck = token.dbCheck ?? 0;
      if (now - lastCheck > 300) {
        const current = await prisma.user.findUnique({
          where: { id: token.id },
          select: { role: true },
        });
        if (!current) return null;
        token.role = current.role;
        token.dbCheck = now;
      }

      return token;
    },

    session({ session, token }) {
      if (token?.id) {
        session.user.id = token.id;
        session.user.role = token.role ?? "VIEWER";
        for (const flag of PENDING_STEP_FLAGS) if (token[flag]) session[flag] = true;
      }
      return session;
    },
  },

  events: {
    async signIn({ user, account }) {
      // A credentials login that still owes a second-factor challenge is
      // only a partial login — the follow-up "credentials-2fa-verified"
      // sign-in produces the single LOGIN_SUCCESS entry and lastLoginAt write.
      if (account?.provider === "credentials" && user.needs2FA) return;

      void logAudit({
        session: null,
        actor: { id: user.id, email: user.email },
        action: "LOGIN_SUCCESS",
        entityType: "Auth",
        entityId: user.id,
        entityName: user.email,
        detail: {
          provider:
            account?.provider === "credentials-2fa-verified"
              ? `credentials+${user.method || "totp"}`
              : account?.provider,
          ...(user.needsPasswordChange || user.needs2FASetup
            ? { pendingEnrollment: true }
            : {}),
        },
      });

      if (user.id) {
        await prisma.user
          .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
          // A failed timestamp write must not block the login itself.
          .catch((err) => console.warn("[auth] failed to record lastLoginAt:", err instanceof Error ? err.message : err));
      }
    },

    async signOut(message) {
      // JWT session strategy delivers { token }; expired sessions may not.
      const token = "token" in message ? message.token : null;
      if (!token?.id) return;
      void logAudit({
        session: null,
        actor: { id: token.id, email: token.email },
        action: "LOGOUT",
        entityType: "Auth",
        entityId: token.id,
        entityName: token.email,
      });
    },
  },

  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
  },
  trustHost: true,
});

export const { handlers, signIn, signOut } = nextAuth;

/**
 * NextAuth's own session read, which also returns a session that still owes a
 * login step (forced password change, 2FA setup, 2FA code). Only for proxy.ts,
 * which redirects such sessions, and for the routes and pages that complete
 * those steps; everything else uses auth().
 */
export const authIncludingPendingSteps = nextAuth.auth;

/**
 * The session of a fully signed-in user, or null: also while a login step is
 * still pending, so no route or page can act on a half-finished sign-in even
 * if the proxy did not stop the request. A pending second factor counts as
 * done on a browser with a valid remember-device token.
 */
export async function auth(): Promise<Session | null> {
  const session = await nextAuth.auth();
  if (!session?.user) return null;
  if (!session.needsPasswordChange && !session.needs2FASetup && !session.needs2FA) return session;
  const rememberMeToken = session.needs2FA ? (await cookies()).get(REMEMBER_ME_COOKIE)?.value : undefined;
  return (await pendingSignInStep(session, rememberMeToken)) ? null : session;
}
