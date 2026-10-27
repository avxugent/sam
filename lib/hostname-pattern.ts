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

/**
 * Generic RFC-1123 FQDN check applied to a hostname when its asset type has no
 * configured pattern: dot-separated labels of 1-63 alphanumerics/hyphens, no
 * leading/trailing hyphen, alphabetic TLD (e.g. projector-room101.example.com).
 */
export const HOSTNAME_FQDN_REGEX =
  /^(?!-)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

/**
 * Whether a hostname is compliant for an asset type: its configured pattern
 * when one is set, otherwise the generic FQDN check. Used by the asset API
 * routes, the asset form and the hostname compliance report.
 */
export function isHostnameCompliant(hostname: string, pattern: string | null | undefined): boolean {
  return pattern ? matchesHostnamePattern(hostname, pattern) : HOSTNAME_FQDN_REGEX.test(hostname);
}
