/** Date formatting shared by server code (CSV, snapshots, audit diffs) and the UI; no dependencies. */

/** Display date like "05 Mar 2026", or "—" when there is none. */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** UTC calendar day as YYYY-MM-DD — the format of date inputs, CSV exports and audit diffs. */
export function toIsoDay(date: Date | string | number): string;
export function toIsoDay(date: Date | string | number | null | undefined): string | null;
export function toIsoDay(date: Date | string | number | null | undefined): string | null {
  return date == null ? null : new Date(date).toISOString().slice(0, 10);
}

/**
 * A date field of a partial update: undefined leaves the column alone (Prisma
 * skips undefined), an empty value clears it, anything else is parsed.
 */
export function toDateUpdate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  return value ? new Date(value) : null;
}
