/**
 * Supplier default-window logic. A supplier with an active window is
 * auto-assigned to assets created (without an explicit supplier) while
 * "today" falls inside [defaultFrom, defaultUntil].
 *
 * Rules:
 *  - defaultFrom null  → window inactive (never matches)
 *  - defaultUntil null → open-ended (matches from defaultFrom onwards)
 *  - boundaries are inclusive, compared at day precision (dates are @db.Date)
 */

export type SupplierWindow = {
  defaultFrom: Date | string | null;
  defaultUntil: Date | string | null;
};

function dayValue(d: Date | string): number {
  const date = typeof d === "string" ? new Date(d) : d;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function isWindowActive(supplier: SupplierWindow, today: Date): boolean {
  if (!supplier.defaultFrom) return false;
  const t = dayValue(today);
  if (dayValue(supplier.defaultFrom) > t) return false;
  if (supplier.defaultUntil && dayValue(supplier.defaultUntil) < t) return false;
  return true;
}

export function findCurrentDefaultSupplier<T extends SupplierWindow>(
  suppliers: T[],
  today: Date
): T | null {
  return suppliers.find((s) => isWindowActive(s, today)) ?? null;
}

/**
 * Whether two windows share at least one day. A window without defaultFrom is
 * inactive and never overlaps; a null defaultUntil extends to infinity.
 */
export function windowsOverlap(a: SupplierWindow, b: SupplierWindow): boolean {
  if (!a.defaultFrom || !b.defaultFrom) return false;
  const aUntil = a.defaultUntil ? dayValue(a.defaultUntil) : Infinity;
  const bUntil = b.defaultUntil ? dayValue(b.defaultUntil) : Infinity;
  return dayValue(a.defaultFrom) <= bUntil && dayValue(b.defaultFrom) <= aUntil;
}
