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
 * Returns the ids of the first pair of suppliers whose windows overlap,
 * or null when no windows overlap. Windows without defaultFrom are inactive
 * and never overlap; a null defaultUntil extends to infinity.
 */
export function findWindowOverlap(
  windows: Array<SupplierWindow & { id: string }>
): [string, string] | null {
  const active = windows.filter((w) => w.defaultFrom);
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      const aFrom = dayValue(a.defaultFrom!);
      const aUntil = a.defaultUntil ? dayValue(a.defaultUntil) : Infinity;
      const bFrom = dayValue(b.defaultFrom!);
      const bUntil = b.defaultUntil ? dayValue(b.defaultUntil) : Infinity;
      if (aFrom <= bUntil && bFrom <= aUntil) {
        return [a.id, b.id];
      }
    }
  }
  return null;
}
