"use client";

import { useMemo, useState } from "react";

/** Checkbox selection over table rows; the "all" helpers take the rows currently visible (filtered). */
export function useRowSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allSelectedIn = (visible: { id: string }[]) => visible.length > 0 && visible.every((r) => selected.has(r.id));
  const someSelectedIn = (visible: { id: string }[]) => !allSelectedIn(visible) && visible.some((r) => selected.has(r.id));

  function toggleAll(visible: { id: string }[]) {
    setSelected(allSelectedIn(visible) ? new Set() : new Set(visible.map((r) => r.id)));
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return { selected, setSelected, toggleAll, toggleRow, allSelectedIn, someSelectedIn };
}

/** One page of `rows`, clamping `page` to the last page when the list shrank. */
export function paginate<T>(rows: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  return { totalPages, safePage, pageRows: rows.slice((safePage - 1) * pageSize, safePage * pageSize) };
}

export type SortDir = "asc" | "desc";

/**
 * Click-to-sort over `rows`: clicking the active column flips the direction, another column sorts it ascending.
 * `keys` maps each sortable column to the row value it sorts by (numbers compare numerically, strings with
 * localeCompare); keep it a stable reference (module constant or useMemo).
 */
export function useTableSort<T, K extends string>(
  rows: T[],
  keys: Record<K, (row: T) => string | number>,
  initialCol: NoInfer<K> | null = null,
  initialDir: SortDir = "asc",
) {
  const [sortCol, setSortCol] = useState<K | null>(initialCol);
  const [sortDir, setSortDir] = useState<SortDir>(initialDir);

  function handleSort(col: K) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }

  const sorted = useMemo(() => {
    if (!sortCol) return rows;
    const key = keys[sortCol];
    return [...rows].sort((a, b) => {
      const av = key(a);
      const bv = key(b);
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, keys, sortCol, sortDir]);

  return { sortCol, sortDir, handleSort, sorted };
}
