import { DefaultSession, DefaultUser } from "next-auth";
import { DefaultJWT } from "next-auth/jwt";
import type { Role } from "@/generated/prisma/enums";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
    /** True while the user has passed password auth but not yet verified their TOTP code */
    needs2FA?: boolean;
    /** True when the admin has required the user to change their password on next login */
    needsPasswordChange?: boolean;
    /** True when the admin has required the user to set up 2FA but they haven't yet */
    needs2FASetup?: boolean;
  }

  interface User extends DefaultUser {
    role?: Role;
    /** Set by the Credentials authorize() when 2FA is required */
    needs2FA?: boolean;
    needsPasswordChange?: boolean;
    needs2FASetup?: boolean;
    /** Second factor used by the "credentials-2fa-verified" provider ("totp" | "passkey") */
    method?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id?: string;
    role?: Role;
    /** True while 2FA verification is still pending */
    needs2FA?: boolean;
    needsPasswordChange?: boolean;
    needs2FASetup?: boolean;
    /** Unix seconds of the last "user still exists" DB check */
    dbCheck?: number;
  }
}
