/**
 * Closed set for User.provider (a plain string in the schema): how the account
 * signs in. Client-safe; readers narrow stored values here.
 */
export const AUTH_PROVIDERS = ["credentials", "microsoft-entra-id"] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

/** A stored provider value, falling back to the column default "credentials" for anything unknown. */
export function parseAuthProvider(value: string | null | undefined): AuthProvider {
  return (AUTH_PROVIDERS as readonly string[]).includes(value ?? "") ? (value as AuthProvider) : "credentials";
}
