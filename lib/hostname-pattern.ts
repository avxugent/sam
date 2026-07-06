/**
 * Validates a per-asset-type hostname regex pattern (JS RegExp syntax).
 * Used when an admin saves AssetType.hostnamePattern, so a broken pattern
 * can never be persisted and later reject every hostname on save.
 */
export function validateHostnamePattern(pattern: string): string | null {
  try {
    new RegExp(pattern);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Invalid regular expression";
  }
}

/**
 * Tests a hostname against an asset type's pattern. Matching is
 * case-insensitive and not auto-anchored — the pattern author controls
 * whether ^/$ are required for a full-string match. A null/empty/invalid
 * pattern always matches (falls through to the caller's generic check).
 */
export function matchesHostnamePattern(hostname: string, pattern: string | null | undefined): boolean {
  if (!pattern) return true;
  try {
    return new RegExp(pattern, "i").test(hostname);
  } catch {
    return true;
  }
}
