/**
 * Canonical MAC address form: AA:BB:CC:DD:EE:FF (uppercase, colon-separated).
 * Accepts any of the legacy input shapes (no separator, hyphen, dot-grouped,
 * mixed case) as long as exactly 12 hex digits remain after stripping
 * separators/whitespace. Returns null if the value can't be normalized
 * (wrong digit count or non-hex characters) — callers should leave the
 * original value untouched in that case rather than guess.
 */
export function normalizeMacAddress(raw: string): string | null {
  const stripped = raw.replace(/[\s:\-.]/g, "");
  if (!/^[0-9A-Fa-f]{12}$/.test(stripped)) return null;
  return stripped.toUpperCase().match(/.{2}/g)!.join(":");
}

/**
 * Formats a MAC address as the user types: strips non-hex input, caps at
 * 12 hex digits, and inserts ":" every 2 digits. Used to auto-punctuate
 * the MAC input field so the user never has to type ":" themselves.
 */
export function formatMacInputValue(raw: string): string {
  const hex = raw.replace(/[^0-9A-Fa-f]/g, "").slice(0, 12).toUpperCase();
  return hex.match(/.{1,2}/g)?.join(":") ?? "";
}
