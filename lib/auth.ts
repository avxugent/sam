import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";

const loginSchema = z.object({
  email: z.string().email(),
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
        const ip =
          request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
          request.headers.get("x-real-ip") ??
          "unknown";
        const ipRl = checkRateLimit(`login:ip:${ip}`, 20, 15 * 60 * 1000);
        const emailRl = checkRateLimit(`login:email:${parsed.data.email}`, 10, 15 * 60 * 1000);
        if (!ipRl.allowed || !emailRl.allowed) return null;

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
          },
        });

        // Reject if user has no password (SSO-only account)
        if (!user || !user.passwordHash) return null;

        const valid = await bcrypt.compare(
          parsed.data.password,
          user.passwordHash
        );
        if (!valid) return null;

        // Forced enrollment flags take priority over 2FA challenge
        if (user.mustChangePassword) {
          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role as string,
            needsPasswordChange: true,
          };
        }

        if (user.twoFactorRequired && !user.totpEnabled) {
          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role as string,
            needs2FASetup: true,
          };
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role as string,
          // Signal that a 2FA step is still required before granting full access
          needs2FA: user.totpEnabled ? true : undefined,
        };
      },
    }),

    // ── Second-factor upgrade provider ────────────────────────────────────
    // Called internally by /api/auth/2fa/verify after TOTP is confirmed.
    // Issues a clean session without the needs2FA flag.
    Credentials({
      id: "credentials-2fa-verified",
      name: "credentials-2fa-verified",
      credentials: {
        userId: { label: "User ID", type: "text" },
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
          role: user.role as string,
          // No needs2FA — this is the verified session
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
          (user as { role?: string }).role = "VIEWER";
        } else {
          user.id = existing.id;
          (user as { role?: string }).role = existing.role as string;
        }
        return true;
      }
      return true;
    },

    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { id?: string; role?: string }).role;
        const u = user as { needs2FA?: boolean; needsPasswordChange?: boolean; needs2FASetup?: boolean };
        if (u.needs2FA) {
          token.needs2FA = true;
        } else {
          delete token.needs2FA;
        }
        if (u.needsPasswordChange) {
          token.needsPasswordChange = true;
        } else {
          delete token.needsPasswordChange;
        }
        if (u.needs2FASetup) {
          token.needs2FASetup = true;
        } else {
          delete token.needs2FASetup;
        }
      }
      return token;
    },

    session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        if (token.needs2FA) session.needs2FA = true;
        if (token.needsPasswordChange) session.needsPasswordChange = true;
        if (token.needs2FASetup) session.needs2FASetup = true;
      }
      return session;
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
