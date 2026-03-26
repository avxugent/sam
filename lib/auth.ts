import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

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
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });

        // Reject if user has no password (SSO-only account)
        if (!user || !user.passwordHash) return null;

        const valid = await bcrypt.compare(
          parsed.data.password,
          user.passwordHash
        );
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role as string,
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
      // Only handle SSO providers here (credentials is handled in authorize())
      if (account?.provider === "microsoft-entra-id") {
        if (!user.email) return false;

        const existing = await prisma.user.findUnique({
          where: { email: user.email },
        });

        if (!existing) {
          // Auto-provision: first SSO login creates a VIEWER account
          const newUser = await prisma.user.create({
            data: {
              name: user.name || user.email,
              email: user.email,
              passwordHash: null,
              provider: "microsoft-entra-id",
              role: "VIEWER",
            },
          });
          // Inject the DB id so the jwt callback can pick it up
          user.id = newUser.id;
          (user as { role?: string }).role = "VIEWER";
        } else {
          // Existing user — inject their SAM id and current role
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
      }
      return token;
    },

    session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },

  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours
  },
  // Required when deployed behind a reverse proxy
  trustHost: true,
});

/** True when Microsoft Entra ID SSO is configured via environment variables */
export const ssoEnabled = entraEnabled;
