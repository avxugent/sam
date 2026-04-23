import { DefaultSession, DefaultUser } from "next-auth";
import { DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
    } & DefaultSession["user"];
    /** True while the user has passed password auth but not yet verified their TOTP code */
    needs2FA?: boolean;
    /** True when the admin has required the user to change their password on next login */
    needsPasswordChange?: boolean;
    /** True when the admin has required the user to set up 2FA but they haven't yet */
    needs2FASetup?: boolean;
  }

  interface User extends DefaultUser {
    role?: string;
    /** Set by the Credentials authorize() when 2FA is required */
    needs2FA?: boolean;
    needsPasswordChange?: boolean;
    needs2FASetup?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id?: string;
    role?: string;
    /** True while 2FA verification is still pending */
    needs2FA?: boolean;
    needsPasswordChange?: boolean;
    needs2FASetup?: boolean;
  }
}
