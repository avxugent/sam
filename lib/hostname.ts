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

/** The pattern as a case-insensitive RegExp, or null when it is empty or invalid. */
function compilePattern(pattern: string | null | undefined): RegExp | null {
  if (!pattern) return null;
  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
}

/**
 * Tests a hostname against an asset type's pattern. Matching is
 * case-insensitive and not auto-anchored — the pattern author controls
 * whether ^/$ are required for a full-string match. A null/empty/invalid
 * pattern always matches; isHostnameCompliant() then applies the generic
 * FQDN check instead.
 */
export function matchesHostnamePattern(hostname: string, pattern: string | null | undefined): boolean {
  return compilePattern(pattern)?.test(hostname) ?? true;
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
 * when one is set and valid, otherwise the generic FQDN check (a stored
 * pattern that no longer compiles must not wave every hostname through).
 * Used by the asset API routes, the asset form and the hostname compliance
 * report.
 */
export function isHostnameCompliant(hostname: string, pattern: string | null | undefined): boolean {
  const compiled = compilePattern(pattern);
  return compiled ? compiled.test(hostname) : HOSTNAME_FQDN_REGEX.test(hostname);
}
