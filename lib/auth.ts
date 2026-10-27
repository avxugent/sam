import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-limits";
import { logAudit } from "@/lib/audit";
import { auditLoginFailure } from "@/lib/login-audit";
import { isTwoFactorSetupRequired } from "@/lib/two-factor/policy";

const loginSchema = z.object({
  email: z.email().max(255),
  password: z.string().min(1),
});

// Microsoft Entra ID is only enabled when all three env vars are present
const entraEnabled =
  !!process.env.AUTH_MICROSOFT_ENTRA_ID_ID &&
  !!process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET &&
  !!process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER;

export const { handlers, auth, signIn, signOut } = NextAuth({
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
        const ipRl = checkRateLimit(`login:ip:${ip}`, 20, 15 * 60 * 1000);
        const emailRl = checkRateLimit(`login:email:${parsed.data.email}`, 10, 15 * 60 * 1000);
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

        // Forced enrollment flags take priority over 2FA challenge
        if (user.mustChangePassword) {
          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            needsPasswordChange: true,
          };
        }

        const hasPasskey = user._count.passkeys > 0;

        // Global requirement (AppSetting) ORs with the per-user flag
        const globalRequire2fa = await prisma.appSetting.findUnique({
          where: { key: "security.requireTwoFactor" },
          select: { value: true },
        });
        if (isTwoFactorSetupRequired({ ...user, hasPasskey }, globalRequire2fa?.value)) {
          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            needs2FASetup: true,
          };
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
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
      },
      async authorize(credentials) {
        const userId =
          typeof credentials?.userId === "string"
            ? credentials.userId
            : null;
        if (!userId) return null;

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
          method: typeof credentials?.method === "string" ? credentials.method : undefined,
        };
      },
    }),

    // Only include Entra ID provider when configured
    ...(entraEnabled
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
        if (user.needs2FA) {
          token.needs2FA = true;
        } else {
          delete token.needs2FA;
        }
        if (user.needsPasswordChange) {
          token.needsPasswordChange = true;
        } else {
          delete token.needsPasswordChange;
        }
        if (user.needs2FASetup) {
          token.needs2FASetup = true;
        } else {
          delete token.needs2FASetup;
        }
        token.dbCheck = Math.floor(Date.now() / 1000);
      }

      // Verify user still exists in the database every 5 minutes.
      // Returns null to invalidate the session if the user has been deleted.
      const now = Math.floor(Date.now() / 1000);
      const lastCheck = token.dbCheck ?? 0;
      if (now - lastCheck > 300) {
        const exists = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { id: true },
        });
        if (!exists) return null;
        token.dbCheck = now;
      }

      return token;
    },

    session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role ?? "VIEWER";
        if (token.needs2FA) session.needs2FA = true;
        if (token.needsPasswordChange) session.needsPasswordChange = true;
        if (token.needs2FASetup) session.needs2FASetup = true;
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
        entityName: user.email ?? undefined,
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
          .catch(() => {});
      }
    },

    async signOut(message) {
      // JWT session strategy delivers { token }; expired sessions may not.
      const token = "token" in message ? message.token : null;
      if (!token?.id) return;
      void logAudit({
        session: null,
        actor: { id: token.id as string, email: token.email },
        action: "LOGOUT",
        entityType: "Auth",
        entityId: token.id as string,
        entityName: token.email ?? undefined,
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

/** True when Microsoft Entra ID SSO is configured via environment variables */
export const ssoEnabled = entraEnabled;
