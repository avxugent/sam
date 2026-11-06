import bcrypt from "bcryptjs";

/** bcrypt cost factor for stored password hashes. Do not lower it (see AGENTS.md security rules). */
export const BCRYPT_COST = 13;

/** The bcrypt hash stored as User.passwordHash; the one place passwords are hashed. */
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}
